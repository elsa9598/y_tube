#!/usr/bin/env node
/**
 * Remotion props 생성기 — 두 가지 입력 모드.
 *
 * [모드 1] 곡 폴더:
 *   node scripts/gen-props.mjs --folder "D:\...\musics\<곡명>"
 *   → 폴더에서 thumbnail.jpg, lyrics.lrc, *.mp4 자동 검출
 *
 * [모드 2] mp4 + JSON (사장님 실제 워크플로우):
 *   node scripts/gen-props.mjs --mp4 "<...>.mp4" --json "<metadata.js|.json>" [--out props.json]
 *   → mp4 첫 프레임을 1:1 이미지로 추출
 *   → JSON.lyrics(LRC 큰 문자열, "eng / kor" 형식) 파싱
 *   → JSON.title → 타이틀
 *
 * 공통: public/current/{image.jpg, audio.mp4} 복사, props.json 출력.
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
  return merged;
}

/** metadata.js(ESM export default) 또는 .json 파일 → 객체 */
async function loadMeta(p) {
  const ext = extname(p).toLowerCase();
  if (ext === ".json") {
    return JSON.parse(readFileSync(p, "utf8"));
  }
  /* .js / .mjs : dynamic import */
  const mod = await import(pathToFileURL(resolve(p)).href);
  return mod.default ?? mod;
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

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--folder") a.folder = argv[++i];
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

let imageSrcPath; // 추출/복사 전 원본 이미지 (없으면 mp4 추출)
let mp4SrcPath;
let lrcText;
let title;

if (args.mp4 && args.lrc) {
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
      '  node scripts/gen-props.mjs --folder "<곡폴더>"\n' +
      '  node scripts/gen-props.mjs --mp4 "<...mp4>" --json "<metadata.js|.json>" [--out props.json]'
  );
  process.exit(1);
}

/* --title 이 명시되면 모든 모드보다 최우선 (서버가 원본 곡 제목 주입) */
if (args.title && args.title.trim()) {
  title = args.title.trim();
}

if (!existsSync(mp4SrcPath)) {
  console.error("mp4 파일 없음:", mp4SrcPath);
  process.exit(1);
}

const lrcLines = parseLrc(lrcText);
const lastLrcTime = lrcLines.length ? lrcLines[lrcLines.length - 1].t : 60;
const durationSec = Math.ceil(lastLrcTime + 12);

/* public/current/ 비우고 자산 배치 */
rmSync(pubDir, { recursive: true, force: true });
mkdirSync(pubDir, { recursive: true });
const audDst = join(pubDir, "audio.mp4");
const imgDst = join(pubDir, "image.jpg");
copyFileSync(mp4SrcPath, audDst);

if (imageSrcPath && existsSync(imageSrcPath)) {
  /* 원본 1:1 이미지가 있으면 그대로 (jpg/png 무관, .jpg 이름으로) */
  copyFileSync(imageSrcPath, imgDst);
} else {
  /* mp4 첫 프레임 추출 (사장님 mp4는 1024×1024 1:1) */
  extractFirstFrame(mp4SrcPath, imgDst);
}

const props = {
  imageUrl: "current/image.jpg",
  audioUrl: "current/audio.mp4",
  durationSec,
  title,
  lrc: lrcLines,
};
writeFileSync(outPath, JSON.stringify(props, null, 2), "utf8");

console.log(`✅ 생성: ${outPath}`);
console.log(
  `   모드: ${args.lrc ? "mp4+lrc" : args.json ? "mp4+JSON" : "곡폴더"}`
);
console.log(`   오디오: ${mp4SrcPath}`);
console.log(
  `   이미지: ${imageSrcPath && existsSync(imageSrcPath) ? imageSrcPath : "(mp4 첫 프레임 추출)"}`
);
console.log(`   LRC 라인 수: ${lrcLines.length}`);
console.log(`   추정 길이: ${durationSec}초 (LRC 마지막 ${lastLrcTime.toFixed(1)}초 + 12초)`);
console.log(`   타이틀: ${title}`);
