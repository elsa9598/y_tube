/**
 * 쇼츠 시작 지점 자동 추천 — 100% 로컬 (외부 API/클라우드 분석 없음).
 *
 * 두 신호를 합산:
 *   1) 가사 후렴 검출: LRC 에서 가장 많이 반복되는 라인 → 첫 등장 시각
 *   2) 음원 에너지: 번들 ffmpeg(ebur128) 라우드니스 → 30초 윈도우 평균 최대 구간
 *
 * 반환: [{ start(초), label }] 상위 N (서로 ≥10초 떨어진 것만).
 * 어떤 단계가 실패해도 throw 하지 않고 기본값(60초)으로 폴백.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const TIMETAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** LRC 텍스트 → [{t, text}] (시각순). 마커/추임새도 포함하되 정규화는 후처리에서. */
function parseLrcLines(content) {
  const lines = [];
  for (const raw of String(content).split(/\r?\n/)) {
    if (/^\s*\[(ti|ar|al|by|offset):/i.test(raw)) continue;
    TIMETAG.lastIndex = 0;
    const tags = [];
    let m;
    let lastIdx = 0;
    while ((m = TIMETAG.exec(raw)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fr = m[3] ?? "0";
      tags.push(min * 60 + sec + parseInt(fr, 10) / Math.pow(10, fr.length));
      lastIdx = TIMETAG.lastIndex;
    }
    if (!tags.length) continue;
    const text = raw.slice(lastIdx).trim();
    if (!text) continue;
    for (const t of tags) lines.push({ t, text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

const hasHangul = (s) => /[가-힣]/.test(s);
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .trim();

/**
 * 후렴 후보: 한국어(=실제 부르는) 라인 중 정규화 텍스트가 2회 이상 반복되는 것.
 * 가장 많이 반복되고, 그중 길이가 충분한 라인의 "첫 등장" 시각을 후렴 시작으로.
 * 인트로 추임새 반복을 피하려 8초 이전 시작은 제외.
 */
function detectChorusStart(lrcLines) {
  const groups = new Map(); // normText → [t...]
  for (const ln of lrcLines) {
    if (!hasHangul(ln.text)) continue;
    const k = norm(ln.text);
    if (k.length < 4) continue; // 너무 짧은 라인 무시
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(ln.t);
  }
  let best = null; // { count, len, firstT }
  for (const [k, times] of groups) {
    if (times.length < 2) continue;
    const firstT = Math.min(...times.filter((t) => t >= 8));
    if (!isFinite(firstT)) continue;
    const cand = { count: times.length, len: k.length, firstT };
    if (
      !best ||
      cand.count > best.count ||
      (cand.count === best.count && cand.len > best.len)
    ) {
      best = cand;
    }
  }
  return best ? best.firstT : null;
}

/** Remotion 번들 ffmpeg(.exe) 경로 (remotionDir/node_modules/@remotion/compositor-*) */
function findFfmpeg(remotionDir) {
  const base = resolve(remotionDir, "node_modules", "@remotion");
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (!d.startsWith("compositor-")) continue;
    const exe = join(
      base,
      d,
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
    );
    if (existsSync(exe)) return exe;
  }
  return null;
}

/**
 * ffmpeg ebur128 로 모멘터리 라우드니스(M) 타임라인 추출.
 * 반환: { dur, perSec:Float (초별 평균 M, 없으면 -70) }
 */
function loudnessTimeline(ffmpeg, mp3Path) {
  /* ebur128 진행 로그는 stderr 로 출력됨 */
  let out;
  try {
    out = execFileSync(
      ffmpeg,
      ["-hide_banner", "-nostats", "-i", mp3Path, "-af", "ebur128", "-f", "null", "-"],
      { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (e) {
    /* execFileSync 는 비0 종료 시 throw 하지만 stderr 는 e.stderr 에 담김 */
    out = (e && e.stderr) ? String(e.stderr) : "";
  }
  const re = /t:\s*([\d.]+)\s.*?M:\s*(-?[\d.]+|-inf)/g;
  const secMap = new Map(); // sec → {sum,n}
  let maxT = 0;
  let m;
  while ((m = re.exec(out)) !== null) {
    const t = parseFloat(m[1]);
    if (!isFinite(t)) continue;
    let M = m[2] === "-inf" ? -70 : parseFloat(m[2]);
    if (!isFinite(M)) M = -70;
    if (M < -70) M = -70;
    const s = Math.floor(t);
    const cur = secMap.get(s) ?? { sum: 0, n: 0 };
    cur.sum += M;
    cur.n += 1;
    secMap.set(s, cur);
    if (t > maxT) maxT = t;
  }
  const dur = Math.ceil(maxT);
  const perSec = new Float64Array(Math.max(1, dur)).fill(-70);
  for (const [s, v] of secMap) if (s < perSec.length) perSec[s] = v.sum / v.n;
  return { dur, perSec };
}

/** 시작 후보를 가장 가까운(≤) 가사 라인 시작에 스냅 (가사 중간에서 안 시작하게) */
function snapToLine(start, lrcLines) {
  let snapped = start;
  for (const ln of lrcLines) {
    if (ln.t <= start + 1.5) snapped = ln.t;
    else break;
  }
  return Math.max(0, Math.round(snapped));
}

const fmtMMSS = (s) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * @param {{ mp3Path:string, lrcText:string, remotionDir:string, lenSec?:number, topN?:number }}
 * @returns {{suggestions:[{start:number,label:string}]}}
 */
export function suggestShortsStarts({
  mp3Path,
  lrcText,
  remotionDir,
  lenSec = 30,
  topN = 3,
}) {
  const fallback = { suggestions: [{ start: 60, label: "기본 60초" }] };
  try {
    let lrcLines = lrcText ? parseLrcLines(lrcText) : [];

    const ffmpeg = findFfmpeg(remotionDir);
    let dur = 0;
    let perSec = null;
    if (ffmpeg && existsSync(mp3Path)) {
      const tl = loudnessTimeline(ffmpeg, mp3Path);
      dur = tl.dur;
      perSec = tl.perSec;
    }
    /* 음원 길이를 모르면 가사 마지막 시각으로 추정 */
    if (!dur && lrcLines.length) dur = Math.ceil(lrcLines[lrcLines.length - 1].t + 6);
    if (!dur) return fallback;

    /* 가사 타임이 음원보다 10%+ 길면 음원 길이에 맞게 선형 축소
       (gen-props 와 동일 규칙 → 추천 위치가 실제 렌더와 일치) */
    if (lrcLines.length) {
      const last = lrcLines[lrcLines.length - 1].t;
      if (last > dur * 1.1) {
        const sc = (dur - 1.5) / last;
        lrcLines = lrcLines.map((l) => ({ t: +(l.t * sc).toFixed(3), text: l.text }));
      }
    }
    const chorusStart = lrcLines.length ? detectChorusStart(lrcLines) : null;

    const maxStart = Math.max(0, dur - lenSec);

    /* 30초 윈도우 평균 라우드니스 (perSec 없으면 0 처리) */
    const windowScore = (st) => {
      if (!perSec) return 0;
      let sum = 0;
      let n = 0;
      for (let s = st; s < st + lenSec && s < perSec.length; s++) {
        sum += perSec[s];
        n++;
      }
      return n ? sum / n : -70;
    };

    /* 윈도우 [st, st+len) 안의 가사 라인 수 (밀집도). 마커( (...)만 )는 제외 */
    const lyricTimes = lrcLines
      .filter((l) => !/^\(.*\)$/.test(l.text.trim()))
      .map((l) => l.t);
    const densityAt = (st) =>
      lyricTimes.reduce((n, t) => n + (t >= st && t < st + lenSec ? 1 : 0), 0);
    let maxDensity = 1;
    for (let st = 0; st <= maxStart; st++) {
      const d = densityAt(st);
      if (d > maxDensity) maxDensity = d;
    }

    /* 후보 수집 */
    const cands = [];

    /* 1) 후렴 시작 (가사) — 강한 가점 */
    if (chorusStart != null) {
      const st = Math.min(maxStart, snapToLine(chorusStart, lrcLines));
      cands.push({ start: st, base: windowScore(st), bonus: 6, why: "후렴" });
    }

    /* 1b) 가사 가장 많은 30초 윈도우 — 멈춘 듯 보이는 듬성 구간 회피 */
    {
      let dSt = 0;
      let dBest = -1;
      for (let st = 0; st <= maxStart; st++) {
        const d = densityAt(st);
        if (d > dBest) {
          dBest = d;
          dSt = st;
        }
      }
      if (dBest >= 2) {
        const sn = Math.min(maxStart, snapToLine(dSt, lrcLines) || dSt);
        cands.push({ start: sn, base: windowScore(sn), bonus: 3, why: "가사" });
      }
    }

    /* 2) 음원 에너지 최고 30초 윈도우 (1초 스텝) */
    if (perSec) {
      let bestSt = 0;
      let bestSc = -Infinity;
      for (let st = 0; st <= maxStart; st++) {
        const sc = windowScore(st);
        if (sc > bestSc) {
          bestSc = sc;
          bestSt = st;
        }
      }
      const snapped = Math.min(maxStart, snapToLine(bestSt, lrcLines) || bestSt);
      cands.push({ start: snapped, base: bestSc, bonus: 0, why: "음원" });

      /* 3) 두 번째로 강한, 첫 후보와 ≥20초 떨어진 윈도우 */
      let st2 = 0;
      let sc2 = -Infinity;
      for (let st = 0; st <= maxStart; st++) {
        if (Math.abs(st - bestSt) < 20) continue;
        const sc = windowScore(st);
        if (sc > sc2) {
          sc2 = sc;
          st2 = st;
        }
      }
      if (sc2 > -Infinity) {
        const sn2 = Math.min(maxStart, snapToLine(st2, lrcLines) || st2);
        cands.push({ start: sn2, base: sc2, bonus: 0, why: "음원" });
      }
    }

    if (!cands.length) return fallback;

    /* 점수 = 라우드니스(0~1) + 보너스 + 가사밀집도(0~1, 가중 4).
       가사 듬성 윈도우는 밀집도 항이 작아 자동으로 밀려남.
       라인 ≤1 인 거의 빈 윈도우는 큰 감점 (멈춘 듯 보이는 구간 배제). */
    for (const c of cands) {
      const d = densityAt(c.start);
      const normD = d / Math.max(1, maxDensity);
      c.score = (c.base + 70) / 70 + c.bonus + 4 * normD - (d <= 1 ? 5 : 0);
    }
    cands.sort((a, b) => b.score - a.score);

    /* 서로 ≥10초 떨어진 것만 상위 N */
    const picked = [];
    for (const c of cands) {
      if (picked.some((p) => Math.abs(p.start - c.start) < 10)) continue;
      picked.push(c);
      if (picked.length >= topN) break;
    }

    const suggestions = picked.map((c, i) => ({
      start: c.start,
      label:
        (c.why === "후렴"
          ? "후렴 "
          : c.why === "가사"
          ? "가사 많음 "
          : i === 0
          ? "추천 "
          : "강한 구간 ") + fmtMMSS(c.start),
    }));
    return { suggestions: suggestions.length ? suggestions : fallback.suggestions };
  } catch {
    return fallback;
  }
}
