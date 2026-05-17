/**
 * y_tube 렌더링 서버.
 *
 * 흐름:
 *   1. POST /render (multipart image + mp3 + json)
 *      → jobs/<id>/ 에 image.<ext>, audio.mp3, meta.json 저장
 *      → 시리얼 큐에 enqueue, jobId 반환
 *   2. 워커가 순서대로:
 *        gen-props.mjs --image --mp3 --json --out  (이미지 원본 그대로 + lyrics 파싱)
 *        npx remotion render Cartoon output.mp4 --props=...
 *        stdout 파싱으로 진행률 갱신
 *   3. GET /status/:id 폴링 → {state, progress, message}
 *   4. GET /download/:id → MP4 스트림
 *
 * 동시성: 1 (PC 한 대 + Remotion 무거움). 사장님 폰 단독 사용이라 충분.
 * 저장소: 메모리 Map. 서버 재시작 시 이력 사라짐 (개인용 도구라 OK).
 */
import express from "express";
import multer from "multer";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { uploadToYouTube } from "./youtube.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const REMOTION_DIR = join(REPO_ROOT, "remotion");
const REMOTION_CLI = join(
  REMOTION_DIR,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js"
);
const JOBS_DIR = join(__dirname, "jobs");
mkdirSync(JOBS_DIR, { recursive: true });
/* 완성 mp4 자동 저장 위치: D:\Claude_works\y_tube\remotion\out\<곡제목>.mp4 */
const OUT_DIR = join(REMOTION_DIR, "out");
mkdirSync(OUT_DIR, { recursive: true });
const safeName = (s) =>
  String(s || "untitled").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);

/* 서버가 절대 죽지 않도록 — 자식 프로세스/렌더 예외는 job 단위로만 실패 처리 */
process.on("uncaughtException", (e) =>
  console.error("[uncaughtException]", e)
);
process.on("unhandledRejection", (e) =>
  console.error("[unhandledRejection]", e)
);

const PORT = Number(process.env.PORT ?? 4000);
const MAX_UPLOAD_MB = 300; // mp4 한 곡 ~50MB. 안전 마진.

/* ========== 작업 큐 ========== */
const jobs = new Map(); // id → { state, progress, message, outputPath, error, createdAt }
const queue = [];
let processing = false;

function enqueue(id) {
  queue.push(id);
  setImmediate(processNext);
}

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;
  const id = queue.shift();
  const job = jobs.get(id);
  if (!job) {
    processing = false;
    return processNext();
  }
  const dir = join(JOBS_DIR, id);
  const imagePath = join(dir, job.imageName || "image.jpg");
  const mp3Path = join(dir, "audio.mp3");
  const jsonPath = join(dir, "meta.json");
  const propsPath = join(dir, "props.json");
  const outPath = join(dir, "output.mp4");

  try {
    job.state = "preparing";
    job.progress = 0;
    job.message = "이미지 배치 + 가사 파싱 중...";
    await runCmd(
      "node",
      [
        "scripts/gen-props.mjs",
        "--image",
        imagePath,
        "--mp3",
        mp3Path,
        "--json",
        jsonPath,
        ...(job.title ? ["--title", job.title] : []),
        ...(job.mode === "shorts"
          ? ["--shorts", "--shorts-start", String(job.shortsStart ?? 60)]
          : []),
        "--out",
        propsPath,
      ],
      REMOTION_DIR,
      () => {}
    );

    job.state = "rendering";
    job.message = "렌더링 시작...";
    await runCmd(
      process.execPath, // node — npx 우회 (Windows .cmd 불안정 회피)
      [
        REMOTION_CLI,
        "render",
        job.mode === "shorts" ? "Shorts" : "Cartoon",
        outPath,
        `--props=${propsPath}`,
        "--concurrency=4",
      ],
      REMOTION_DIR,
      (line) => {
        const m = line.match(/Rendered (\d+)\/(\d+)/);
        if (m) {
          const cur = +m[1], total = +m[2];
          job.progress = Math.round((cur / total) * 80); // 0~80% = 프레임 렌더
          job.message = `프레임 렌더 ${cur}/${total}`;
          return;
        }
        const e = line.match(/Encoded (\d+)\/(\d+)/);
        if (e) {
          const cur = +e[1], total = +e[2];
          job.progress = 80 + Math.round((cur / total) * 20); // 80~100% = 인코딩
          job.message = `인코딩 ${cur}/${total}`;
        }
      }
    );

    if (!existsSync(outPath)) {
      throw new Error("렌더는 끝났지만 출력 파일이 없습니다");
    }
    job.state = "done";
    job.progress = 100;
    job.message = "완료";
    job.outputPath = outPath;
    job.outputSize = statSync(outPath).size;
    /* 곡 제목으로 D:\Claude_works\y_tube\out\ 에 자동 저장 */
    try {
      const suffix = job.mode === "shorts" ? " [쇼츠]" : "";
      const finalPath = join(
        OUT_DIR,
        safeName((job.title || id) + suffix) + ".mp4"
      );
      copyFileSync(outPath, finalPath);
      job.savedPath = finalPath;
      console.log(`[job ${id}] 📁 저장: ${finalPath}`);
    } catch (e) {
      console.error(`[job ${id}] out 복사 실패:`, e.message);
    }
    console.log(`[job ${id}] ✅ done — ${(job.outputSize / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    job.state = "error";
    job.error = String(err.message ?? err);
    job.message = `실패: ${job.error}`;
    console.error(`[job ${id}] ❌`, err);
  } finally {
    processing = false;
    setImmediate(processNext);
  }
}

/** spawn child + stdout 라인 단위 콜백 + UTF-8 인코딩 */
function runCmd(cmd, args, cwd, onStdoutLine) {
  return new Promise((resolveFn, rejectFn) => {
    const isWin = process.platform === "win32";
    /* npx 같은 .cmd 호출은 Node 24 보안 변경으로 shell:true 필요 */
    const useShell = isWin && (cmd === "npx" || cmd.endsWith(".cmd"));
    const ch = spawn(cmd, args, { cwd, shell: useShell });
    ch.stdout.setEncoding("utf8");
    ch.stderr.setEncoding("utf8");
    let buf = "";
    ch.stdout.on("data", (d) => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) onStdoutLine(line);
      }
    });
    ch.stderr.on("data", (d) => {
      /* Remotion이 progress를 stderr로 보내는 경우도 있어 같은 콜백에 흘림 */
      const lines = d.split(/\r?\n/);
      for (const ln of lines) {
        const t = ln.trim();
        if (t) onStdoutLine(t);
      }
    });
    ch.on("close", (code) => {
      if (code === 0) resolveFn();
      else rejectFn(new Error(`${cmd} exit ${code}`));
    });
    ch.on("error", rejectFn);
  });
}

/* ========== Express ========== */
const app = express();
app.use(cors());

/* 🔒 외부(ngrok) 노출 보호 — ID/PW Basic 인증.
   .env(D:\.env) 의 WEB_USER / WEB_PASS 사용. 둘 다 없으면 잠금 해제(로컬 전용 모드). */
let WEB_USER = "",
  WEB_PASS = "";
try {
  const env = readFileSync("D:/.env", "utf8");
  const ge = (k) => {
    const m = env.match(new RegExp("^" + k + '=\\"?([^\\"\\r\\n]+)', "m"));
    return m ? m[1].trim() : "";
  };
  WEB_USER = ge("WEB_USER");
  WEB_PASS = ge("WEB_PASS");
} catch {}
if (WEB_USER && WEB_PASS) {
  app.use((req, res, next) => {
    const h = req.headers.authorization || "";
    const dec = Buffer.from(h.split(" ")[1] || "", "base64").toString();
    const i = dec.indexOf(":");
    if (dec.slice(0, i) === WEB_USER && dec.slice(i + 1) === WEB_PASS) {
      return next();
    }
    res
      .set("WWW-Authenticate", 'Basic realm="y_tube"')
      .status(401)
      .end("인증이 필요합니다");
  });
  console.log("🔒 Basic 인증 활성 (WEB_USER/WEB_PASS)");
} else {
  console.log("⚠️  WEB_USER/WEB_PASS 없음 — 인증 없이 전체 공개 (로컬 전용으로만 쓰세요)");
}

app.use(express.json({ limit: "1mb" }));
/* 로컬 웹 UI (server/public/index.html) */
app.use(express.static(join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    jobsTotal: jobs.size,
    queueLen: queue.length,
    processing,
    uptimeSec: Math.round(process.uptime()),
  });
});

/**
 * POST /render
 *   multipart fields:
 *     - image (file, required) — 사장님이 만든 1:1 이미지 (png/jpg)
 *     - mp3   (file, required) — 음원
 *     - json  (file, required) — { title, lyrics(LRC 큰 문자열) }
 *   응답: { jobId, state }
 */
app.post(
  "/render",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "mp3", maxCount: 1 },
    { name: "json", maxCount: 1 },
  ]),
  (req, res) => {
    const imageFile = req.files?.image?.[0];
    const mp3File = req.files?.mp3?.[0];
    const jsonFile = req.files?.json?.[0];
    if (!imageFile) return res.status(400).json({ error: "이미지 파일 누락" });
    if (!mp3File) return res.status(400).json({ error: "mp3 파일 누락" });
    if (!jsonFile) return res.status(400).json({ error: "json 파일 누락" });

    const id = randomUUID();
    const dir = join(JOBS_DIR, id);
    mkdirSync(dir, { recursive: true });

    /* 이미지 확장자 보존 (.png/.jpg/.jpeg/.webp 그대로) */
    const extRaw = extname(imageFile.originalname || "").toLowerCase();
    const imageName =
      "image" + (/^\.(png|jpe?g|webp|gif)$/.test(extRaw) ? extRaw : ".jpg");
    writeFileSync(join(dir, imageName), imageFile.buffer);
    writeFileSync(join(dir, "audio.mp3"), mp3File.buffer);
    writeFileSync(join(dir, "meta.json"), jsonFile.buffer);

    /* 제목: UI가 JSON.title 을 읽어 보냄. 없으면 gen-props가 JSON.title 사용 */
    const title = String(req.body?.title ?? "").trim();
    /* 포맷: normal(16:9) | shorts(9:16, 기본 60초 지점부터 30초) */
    const mode = req.body?.mode === "shorts" ? "shorts" : "normal";
    const shortsStart = Math.max(0, Number(req.body?.shortsStart ?? 60) || 60);

    jobs.set(id, {
      state: "queued",
      progress: 0,
      message: "대기 중",
      title,
      imageName,
      mode,
      shortsStart,
      createdAt: new Date().toISOString(),
    });
    enqueue(id);

    console.log(
      `[job ${id}] queued — ${mode}${
        mode === "shorts" ? `@${shortsStart}s` : ""
      } · image ${(imageFile.size / 1024 / 1024).toFixed(1)}MB · mp3 ${(
        mp3File.size /
        1024 /
        1024
      ).toFixed(1)}MB`
    );
    res.json({ jobId: id, state: "queued" });
  }
);

app.get("/status/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "job 없음" });
  const { outputPath, ...safe } = job;
  res.json({ ...safe, hasOutput: !!outputPath });
});

/**
 * POST /upload/:id
 *   body: { title, description, tags[], privacyStatus }
 *   렌더 완료된 job의 output.mp4를 유튜브에 업로드. 비동기 시작 → /status로 추적.
 */
app.post("/upload/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !job.outputPath || !existsSync(job.outputPath)) {
    return res.status(404).json({ error: "렌더 결과 없음" });
  }
  if (job.upload && job.upload.state === "uploading") {
    return res.status(409).json({ error: "이미 업로드 중" });
  }
  const meta = {
    title: String(req.body?.title ?? "").trim(),
    description: String(req.body?.description ?? ""),
    tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
    privacyStatus: ["public", "unlisted", "private"].includes(
      req.body?.privacyStatus
    )
      ? req.body.privacyStatus
      : "private",
  };
  if (!meta.title) return res.status(400).json({ error: "제목 필수" });

  /* 쇼츠는 #Shorts 가 있어야 유튜브가 쇼츠로 분류 */
  if (job.mode === "shorts" && !/#shorts/i.test(meta.description + meta.title)) {
    meta.description = (meta.description ? meta.description + "\n\n" : "") + "#Shorts";
  }

  job.upload = { state: "uploading", progress: 0, message: "준비 중", url: null };
  uploadToYouTube(job.outputPath, meta, (p, m) => {
    job.upload.progress = Math.round(p);
    job.upload.message = m;
  })
    .then((url) => {
      job.upload.state = "done";
      job.upload.progress = 100;
      job.upload.message = "업로드 완료";
      job.upload.url = url;
      console.log(`[job ${req.params.id}] ▶ youtube: ${url}`);
    })
    .catch((err) => {
      job.upload.state = "error";
      job.upload.message = String(err.message ?? err);
      console.error(`[job ${req.params.id}] youtube ❌`, err);
    });

  res.json({ started: true });
});

app.get("/download/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !job.outputPath || !existsSync(job.outputPath)) {
    return res.status(404).json({ error: "결과 없음" });
  }
  const stat = statSync(job.outputPath);
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Length", stat.size);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${req.params.id}.mp4"`
  );
  createReadStream(job.outputPath).pipe(res);
});

/* 로컬/네트워크 양쪽에서 접근 가능하게 0.0.0.0 바인드 */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🎬 y_tube render server  http://0.0.0.0:${PORT}`);
  console.log(`   POST /render          multipart image + mp3 + json`);
  console.log(`   GET  /status/:id      진행률 폴링`);
  console.log(`   GET  /download/:id    결과 MP4`);
  console.log(`   POST /upload/:id      유튜브 업로드`);
  console.log(`   웹 UI →  http://localhost:${PORT}`);
  console.log(`   GET  /health          상태`);
  console.log(`   jobs dir              ${JOBS_DIR}`);
  console.log(`   remotion dir          ${REMOTION_DIR}`);
});
