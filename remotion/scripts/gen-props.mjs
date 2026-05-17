#!/usr/bin/env node
/**
 * Remotion props 생성기 — 입력 모드.
 *
 * [모드 0] 이미지 + 음원(mp3|mp4) + JSON (현재 주력 워크플로우):
 *   node scripts/gen-props.mjs --image "<...>.png" --audio "<...>.mp3|.mp4" --json "<...>.json" [--out props.json]
 *   → 사장님이 만든 이미지를 변형 없이 그대로 사용 (음원이 mp4여도 프레임 추출 X)
 *   → 음원의 오디오 트랙 사용 (mp3 그대로 / mp4는 AAC 트랙)
 *   → JSON.lyrics(LRC 큰 문자열) 파싱, JSON.title → 타이틀
 *
 * [모드 1] 곡 폴더:
 *   node scripts/gen-props.mjs --folder "D:\...\musics\<곡명>"
 *   → 폴더에서 thumbnail.jpg, lyrics.lrc, *.mp4 자동 검출
 *
 * [모드 2] mp4 + lrc / [모드 3] mp4 + JSON (하위호환):
 *   node scripts/gen-props.mjs --mp4 "<...>.mp4" --lrc "<...>.lrc" [--out props.json]
 *   → mp4 첫 프레임을 1:1 이미지로 추출
 *
 * 공통: public/current/{image.jpg, audio.mp3|audio.mp4} 복사, props.json 출력.
 */
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const TIMETAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** LRC 텍스트 → [{t, text}]. "eng / kor" 한 라인은 \n으로 합침. */
function parseLrc(content) {
  const lines = [];
  for (const raw of content.split(/\r?\n/)) {
    if (/^\s*\[(ti|ar|al|by|offset):/i.test(raw)) continue;
    const tags = [];
    let lastIdx = 0;
    TIMETAG.lastIndex = 0;
    let m;
    while ((m = TIMETAG.exec(raw)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] ?? "0";
      const frac = parseInt(fracStr, 10) / Math.pow(10, fracStr.length);
      tags.push(min * 60 + sec + frac);
      lastIdx = TIMETAG.lastIndex;
    }
    if (tags.length === 0) continue;
    let text = raw.slice(lastIdx).trim();
    if (text.length === 0) continue;
    /* "english / 한국어" → 두 줄로 (Composition이 whiteSpace:pre-line으로 표시) */
    if (text.includes(" / ")) {
      text = text
        .split(" / ")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n");
    }
    for (const t of tags) lines.push({ t, text });
  }
  /* 같은 시각(±0.05s) 라인 병합 */
  const merged = [];
  for (const ln of lines.sort((a, b) => a.t - b.t)) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.t - ln.t) < 0.05) {
      last.text = last.text + "\n" + ln.text;
    } else {
      merged.push({ t: ln.t, text: ln.text });
    }
  }
  /* 한 라인 + 바로 뒤 라인이 (한↔영) 짝이면 한 블록으로 묶음. 순서 무관:
       한국어→영어  / 영어→한국어  둘 다 지원 (사장님 JSON·metadata.js 형식 차이)
     표시는 항상 영어(위) / 한국어(아래), 하이라이트 시각은 더 이른(=먼저 부르는) 라인.
     추임새·마커( (...)로만 된 라인 )는 짝짓지 않고 단독 유지. */
  const hasHangul = (s) => /[가-힣]/.test(s);
  const isLyric = (s) =>
    /[A-Za-z가-힣]/.test(s) && !/^\(.*\)$/.test(s.trim());
  const paired = [];
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    const next = merged[i + 1];
    if (
      next &&
      isLyric(cur.text) &&
      isLyric(next.text) &&
      hasHangul(cur.text) !== hasHangul(next.text) && // 정확히 한 쪽만 한국어
      next.t - cur.t <= 6
    ) {
      const ko = hasHangul(cur.text) ? cur.text : next.text;
      const en = hasHangul(cur.text) ? next.text : cur.text;
      paired.push({ t: cur.t, text: en + "\n" + ko }); // 영어 위 / 한국어 아래
      i++; // 짝 라인 소비
    } else {
      paired.push(cur);
    }
  }
  return paired;
}

/** 순수 JSON / `export default {...}` / `module.exports = {...}` / `//`·`/* *\/` 주석
    섞인 metadata.js 를 모두 객체로. (서버는 업로드 파일을 meta.json 으로 저장하므로
    확장자만으론 형식을 알 수 없음 → 내용으로 관용 파싱) */
function looseParseMeta(text) {
  let t = String(text).replace(/^﻿/, "");
  try {
    return JSON.parse(t);
  } catch {}
  /* 주석·모듈 래퍼 제거 후 재시도 */
  t = t
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*export\s+default\s*/m, "")
    .replace(/^\s*module\.exports\s*=\s*/m, "")
    .trim()
    .replace(/;\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {}
  /* 최후: JS 객체 리터럴로 평가 (외부 통신 없음, 로컬 신뢰 입력) */
  return Function('"use strict";return (' + t + ");")();
}

/** metadata.js(ESM export default) 또는 .json/.txt 파일 → 객체 (관용 파싱) */
async function loadMeta(p) {
  const ext = extname(p).toLowerCase();
  if (ext === ".js" || ext === ".mjs") {
    try {
      const mod = await import(pathToFileURL(resolve(p)).href);
      return mod.default ?? mod;
    } catch {
      /* import 실패(확장자/구문) → 텍스트 관용 파싱 폴백 */
    }
  }
  return looseParseMeta(readFileSync(p, "utf8"));
}

/** Remotion 번들 ffmpeg(.exe) 경로 탐색 (node_modules/@remotion/compositor-... 안) */
function findBundledFfmpeg() {
  const base = resolve("node_modules", "@remotion");
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith("compositor-")) continue;
    const exe = join(base, dir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    if (existsSync(exe)) return exe;
  }
  return null;
}

/** mp4 첫 프레임을 jpg로 추출 (Remotion 번들 ffmpeg.exe 직접 실행) */
function extractFirstFrame(mp4Path, outJpg) {
  const ffmpeg = findBundledFfmpeg();
  if (!ffmpeg) {
    console.error("Remotion 번들 ffmpeg를 찾지 못했습니다 (node_modules/@remotion/compositor-*).");
    process.exit(1);
  }
  execFileSync(
    ffmpeg,
    ["-y", "-i", mp4Path, "-frames:v", "1", "-q:v", "2", outJpg],
    { stdio: "ignore" }
  );
}

/** 오디오/영상 실제 재생 길이(초). 실패 시 0. */
function getMediaDurationSec(srcPath) {
  const ffmpeg = findBundledFfmpeg();
  if (!ffmpeg) return 0;
  let out = "";
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", srcPath], {
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
  } catch (e) {
    out = (e && e.stderr) ? String(e.stderr) : "";
  }
  const m = out.match(/Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!m) return 0;
  return (
    +m[1] * 3600 + +m[2] * 60 + +m[3] + (m[4] ? parseFloat("0." + m[4]) : 0)
  );
}

/** 오디오의 [startSec, startSec+lenSec) 구간을 mp3로 잘라냄 (쇼츠용). */
function trimAudioToMp3(srcPath, outMp3, startSec, lenSec) {
  const ffmpeg = findBundledFfmpeg();
  if (!ffmpeg) {
    console.error("Remotion 번들 ffmpeg를 찾지 못했습니다 (node_modules/@remotion/compositor-*).");
    process.exit(1);
  }
  /* -ss/-t 를 -i 뒤에 둬서 프레임 정확도 확보, libmp3lame 재인코딩 */
  execFileSync(
    ffmpeg,
    [
      "-y",
      "-i", srcPath,
      "-ss", String(startSec),
      "-t", String(lenSec),
      "-vn",
      "-acodec", "libmp3lame",
      "-q:a", "3",
      outMp3,
    ],
    { stdio: "ignore" }
  );
}

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--folder") a.folder = argv[++i];
    else if (k === "--image") a.image = argv[++i];
    else if (k === "--mp3") a.mp3 = argv[++i];
    else if (k === "--audio") a.mp3 = argv[++i]; // mp3/mp4 공용 (mp4면 오디오 트랙 사용)
    else if (k === "--shorts") a.shorts = true;
    else if (k === "--shorts-start") a.shortsStart = argv[++i];
    else if (k === "--shorts-len") a.shortsLen = argv[++i];
    else if (k === "--mp4") a.mp4 = argv[++i];
    else if (k === "--lrc") a.lrc = argv[++i];
    else if (k === "--title") a.title = argv[++i];
    else if (k === "--json") a.json = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (!k.startsWith("--") && !a.folder && !a.mp4) a.folder = k; // 하위호환: 첫 위치인자=폴더
  }
  return a;
}

const args = parseArgs(process.argv);
const pubDir = resolve("public", "current");
const outPath = resolve(args.out ?? "sample-props.json");

let imageSrcPath; // 원본 이미지 (있으면 그대로 복사, 없으면 mp4 첫 프레임 추출)
let mp4SrcPath; // mp4 첫 프레임 추출용 (구 모드만)
let audioSrcPath; // 실제 오디오 소스 (mp3 또는 mp4)
let lrcText;
let title;

if (args.image && args.mp3 && args.json) {
  /* ===== 모드 0: 이미지 + mp3 + JSON (현재 주력 워크플로우) =====
     사장님이 만든 이미지를 Gemini mp4 변형 없이 그대로 사용 */
  const meta = await loadMeta(resolve(args.json));
  if (!meta || typeof meta.lyrics !== "string") {
    console.error("JSON에 lyrics(문자열) 필드가 없습니다:", Object.keys(meta ?? {}));
    process.exit(1);
  }
  lrcText = meta.lyrics;
  title = (meta.title ?? "오둥이의 하루").toString();
  imageSrcPath = resolve(args.image);
  audioSrcPath = resolve(args.mp3);
  mp4SrcPath = null;
} else if (args.mp4 && args.lrc) {
  /* ===== 모드 2: mp4 + lyrics.lrc (사장님 실제 워크플로우) ===== */
  mp4SrcPath = resolve(args.mp4);
  lrcText = readFileSync(resolve(args.lrc), "utf8");
  /* 제목: LRC [ti:...] 태그 우선 → 없으면 mp4 파일명(_→공백) */
  const tiMatch = lrcText.match(/\[ti:([^\]]+)\]/i);
  title = tiMatch
    ? tiMatch[1].trim()
    : basename(mp4SrcPath, ".mp4").replace(/_/g, " ").trim();
  imageSrcPath = null; // mp4 첫 프레임에서 추출
} else if (args.mp4 && args.json) {
  /* ===== 모드 3: mp4 + JSON (lyrics 필드 포함 형식, 하위호환) ===== */
  mp4SrcPath = resolve(args.mp4);
  const meta = await loadMeta(resolve(args.json));
  if (!meta || typeof meta.lyrics !== "string") {
    console.error("JSON에 lyrics(문자열) 필드가 없습니다:", Object.keys(meta ?? {}));
    process.exit(1);
  }
  lrcText = meta.lyrics;
  title = (meta.title ?? basename(mp4SrcPath, ".mp4")).toString();
  imageSrcPath = null;
} else if (args.folder) {
  /* ===== 모드 1: 곡 폴더 ===== */
  const folder = resolve(args.folder);
  const files = readdirSync(folder);
  const mp4 = files.find((f) => f.toLowerCase().endsWith(".mp4"));
  const lrc = files.find((f) => f.toLowerCase().endsWith(".lrc"));
  const img =
    files.find((f) => /thumbnail\.(jpg|jpeg|png)$/i.test(f)) ??
    files.find((f) => /\.(jpg|jpeg|png)$/i.test(f));
  if (!mp4 || !lrc) {
    console.error("폴더에 mp4 또는 lrc 누락:", { mp4, lrc, img });
    process.exit(1);
  }
  mp4SrcPath = join(folder, mp4);
  lrcText = readFileSync(join(folder, lrc), "utf8");
  imageSrcPath = img ? join(folder, img) : null;
  const folderName = basename(folder);
  const matchKo = folderName.match(/\(([^)]+)\)/);
  title = matchKo ? matchKo[1].replace(/_/g, " ") : folderName.replace(/_/g, " ");
} else {
  console.error(
    "사용법:\n" +
      '  node scripts/gen-props.mjs --image "<...png>" --mp3 "<...mp3>" --json "<...json>"\n' +
      '  node scripts/gen-props.mjs --folder "<곡폴더>"\n' +
      '  node scripts/gen-props.mjs --mp4 "<...mp4>" --lrc "<...lrc>" [--out props.json]'
  );
  process.exit(1);
}

/* 구 모드(mp4 기반)는 오디오 소스 = mp4. 새 모드는 위에서 mp3로 이미 설정됨 */
audioSrcPath = audioSrcPath ?? mp4SrcPath;

/* --title 이 명시되면 모든 모드보다 최우선 (서버가 원본 곡 제목 주입) */
if (args.title && args.title.trim()) {
  title = args.title.trim();
}

if (!audioSrcPath || !existsSync(audioSrcPath)) {
  console.error("오디오 파일 없음:", audioSrcPath);
  process.exit(1);
}

let lrcLines = parseLrc(lrcText);

/* ===== 가사 타임 ↔ 음원 길이 정합 =====
   AI 생성곡은 가사 LRC 타임이 실제 음원보다 길게(혹은 짧게) 찍힌 경우가 많음.
   가사 마지막 시각이 음원 길이를 10% 이상 초과하면, 가사 끝이 음원 끝
   직전(−1.5s)에 오도록 전체 타임을 선형 축소 → 음원과 동기. */
const audioDurSec = getMediaDurationSec(audioSrcPath);
let rawLastLrc = lrcLines.length ? lrcLines[lrcLines.length - 1].t : 0;
let lrcScale = 1;
if (audioDurSec > 1 && rawLastLrc > audioDurSec * 1.1) {
  lrcScale = (audioDurSec - 1.5) / rawLastLrc;
  lrcLines = lrcLines.map((ln) => ({
    t: +(ln.t * lrcScale).toFixed(3),
    text: ln.text,
  }));
  console.log(
    `   ⏱ 가사 타임 보정: 가사끝 ${rawLastLrc.toFixed(0)}s > 음원 ${audioDurSec.toFixed(
      0
    )}s → ×${lrcScale.toFixed(3)} 축소`
  );
}
const fullLastLrc = lrcLines.length ? lrcLines[lrcLines.length - 1].t : 60;

/* ===== 쇼츠: [start, start+len) 구간만 잘라 0초 기준으로 시프트 ===== */
const isShorts = !!args.shorts;
const shortsStart = Math.max(0, Number(args.shortsStart ?? 60) || 60);
const shortsLen = Math.max(1, Number(args.shortsLen ?? 30) || 30);
let durationSec;
if (isShorts) {
  const end = shortsStart + shortsLen;
  /* 구간 시작 시점에 이미 떠 있어야 할 직전 라인을 0초로 고정 */
  let carry = null;
  for (const ln of lrcLines) {
    if (ln.t <= shortsStart) carry = ln;
    else break;
  }
  const win = lrcLines
    .filter((ln) => ln.t > shortsStart && ln.t < end)
    .map((ln) => ({ t: +(ln.t - shortsStart).toFixed(3), text: ln.text }));
  if (carry) win.unshift({ t: 0, text: carry.text });
  lrcLines = win;
  durationSec = shortsLen;
} else {
  /* 음원 길이를 알면 영상 길이 = 음원 길이(가사 끝과 정합). 모르면 가사끝+12 */
  durationSec =
    audioDurSec > 1 ? Math.ceil(audioDurSec) : Math.ceil(fullLastLrc + 12);
}

/* public/current/ 비우고 자산 배치 */
rmSync(pubDir, { recursive: true, force: true });
mkdirSync(pubDir, { recursive: true });
/* 쇼츠는 항상 mp3로 트림. 일반은 소스 확장자 유지 */
const audDstName = isShorts || /\.mp3$/i.test(audioSrcPath) ? "audio.mp3" : "audio.mp4";
const audDst = join(pubDir, audDstName);
const imgDst = join(pubDir, "image.jpg");
if (isShorts) {
  trimAudioToMp3(audioSrcPath, audDst, shortsStart, shortsLen);
} else {
  copyFileSync(audioSrcPath, audDst);
}

if (imageSrcPath && existsSync(imageSrcPath)) {
  /* 원본 이미지가 있으면 변형 없이 그대로 (jpg/png 무관, .jpg 이름으로) */
  copyFileSync(imageSrcPath, imgDst);
} else if (mp4SrcPath) {
  /* 구 모드: mp4 첫 프레임 추출 */
  extractFirstFrame(mp4SrcPath, imgDst);
} else {
  console.error("이미지 소스 없음 (--image 또는 mp4 필요):", imageSrcPath);
  process.exit(1);
}

const props = {
  imageUrl: "current/image.jpg",
  audioUrl: `current/${audDstName}`,
  durationSec,
  title,
  lrc: lrcLines,
};
writeFileSync(outPath, JSON.stringify(props, null, 2), "utf8");

console.log(`✅ 생성: ${outPath}`);
console.log(
  `   모드: ${
    args.image && args.mp3
      ? "이미지+mp3+JSON"
      : args.lrc
      ? "mp4+lrc"
      : args.json
      ? "mp4+JSON"
      : "곡폴더"
  }`
);
console.log(`   오디오: ${audioSrcPath}`);
console.log(
  `   이미지: ${imageSrcPath && existsSync(imageSrcPath) ? imageSrcPath : "(mp4 첫 프레임 추출)"}`
);
console.log(`   포맷: ${isShorts ? `쇼츠 9:16 (${shortsStart}s~${shortsStart + shortsLen}s)` : "일반 16:9"}`);
console.log(`   LRC 라인 수: ${lrcLines.length}`);
console.log(
  `   길이: ${durationSec}초 ${
    isShorts
      ? "(쇼츠 구간)"
      : audioDurSec > 1
      ? `(음원 ${audioDurSec.toFixed(1)}초 정합, 가사끝 ${fullLastLrc.toFixed(1)}초)`
      : `(LRC 마지막 ${fullLastLrc.toFixed(1)}초 + 12초)`
  }`
);
console.log(`   타이틀: ${title}`);
