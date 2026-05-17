/**
 * 네이버 블로그 — 본문 생성(100% 로컬 Ollama) + 게시(Puppeteer 브라우저 자동화).
 *
 * - 본문 생성: 로컬 Ollama(gemma) 만 사용. 외부 클라우드 AI 금지(회사 원칙).
 * - 게시: 공식 API는 영상 첨부·카테고리 지정 불가 → 브라우저 자동화.
 *   네이버는 자동화 탐지가 강함 → headful + userDataDir 로 세션 유지,
 *   캡차/2단계 인증은 첫 회 사장님이 직접(창이 떠 있음) 처리.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ===== 철학자별 명언집 (로컬 내장, 한 줄 인용) ===== */
const QUOTES = {
  nietzsche: {
    label: "니체",
    lines: [
      "너를 죽이지 못하는 것은 너를 더 강하게 만든다.",
      "춤추는 별을 낳으려면 자기 안에 혼돈을 지녀야 한다.",
      "왜 살아야 하는지 아는 사람은 그 어떤 어려움도 견딜 수 있다.",
      "괴물과 싸우는 사람은 스스로 괴물이 되지 않도록 조심해야 한다.",
      "삶이 너에게 던지는 모든 순간을 사랑하라 — 운명을 사랑하라(Amor fati).",
      "사람은 극복되어야 할 그 무엇이다.",
    ],
  },
  schopenhauer: {
    label: "쇼펜하우어",
    lines: [
      "삶은 욕망과 권태 사이를 오가는 시계추와 같다.",
      "고독은 모든 뛰어난 정신의 운명이다.",
      "재산은 바닷물과 같아서 마실수록 더 목이 마르다.",
      "인간이 가질 수 있는 가장 큰 지혜는 현재를 사는 것이다.",
      "행복은 대체로 고통이 없는 상태일 뿐이다.",
      "평범한 사람은 시간을 어떻게 보낼지 고민하고, 재능 있는 사람은 시간을 어떻게 쓸지 고민한다.",
    ],
  },
};

function pickQuote(philosopher, seed) {
  const q = QUOTES[philosopher] || QUOTES.nietzsche;
  const i = Math.abs(hashStr(seed || "")) % q.lines.length;
  return { label: q.label, line: q.lines[i] };
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* ===== 로컬 Ollama 호출 ===== */
const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

async function ollamaGenerate(prompt, { timeoutMs = 120000 } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.8, num_predict: 900 },
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const j = await r.json();
    return String(j.response ?? "").trim();
  } finally {
    clearTimeout(to);
  }
}

/**
 * 블로그 초안 생성 (로컬 LLM).
 * @returns {{title,bodyLines:string[],tags:string[],quote:{label,line},
 *            philosopher,category}}
 */
export async function generateBlogDraft({
  topic,
  philosopher,
  songTitle,
}) {
  const ph = philosopher === "schopenhauer" ? "schopenhauer" : "nietzsche";
  const phName = QUOTES[ph].label;
  const quote = pickQuote(ph, (topic || "") + songTitle);
  const category = "오둥이 감성음악";

  const prompt =
    `당신은 감성 음악 블로그 작가입니다. 아래 조건을 지켜 한국어 블로그 본문을 써주세요.\n\n` +
    `[주제] ${topic}\n` +
    `[철학자 관점] ${phName}\n` +
    `[참고 명언] "${quote.line}" — ${phName}\n` +
    `[연결할 노래] ${songTitle}\n\n` +
    `요구사항:\n` +
    `1) ${phName}의 사상으로 주제를 깊이 있게, 그러나 누구나 이해하기 쉽게 해석.\n` +
    `2) 일상적인 짧은 이야기(스토리) 예시를 1개 들어 의미를 와닿게.\n` +
    `3) 너무 무겁지 않게, 따뜻하고 감성적인 톤. 적재적소에 이모지 사용.\n` +
    `4) **한 문장마다 줄바꿈**. 총 8~16줄(20줄 절대 넘기지 말 것). ` +
    `제목/태그/머리말/번호 쓰지 말고 본문 문장만.\n` +
    `5) 마지막 줄은 노래 "${songTitle}"를 들으며 마무리하는 한 문장.\n\n` +
    `본문:`;

  let raw = "";
  try {
    raw = await ollamaGenerate(prompt);
  } catch (e) {
    raw = "";
  }

  let bodyLines = raw
    .replace(/^본문\s*[:：]?\s*/i, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\[(제목|태그|본문)\]/.test(l))
    .slice(0, 20);

  if (bodyLines.length === 0) {
    bodyLines = [
      `🎵 "${topic}" — ${phName}의 시선으로 가만히 들여다봅니다.`,
      `"${quote.line}" 이 한 줄이 오늘 마음에 머무릅니다. 🌿`,
      `노래 「${songTitle}」와 함께, 천천히 음미해보세요. 💛`,
    ];
  }

  /* 태그: LLM 별도 호출(짧게) → 실패 시 규칙 기반 */
  let tags = [];
  try {
    const tg = await ollamaGenerate(
      `다음 블로그 주제에 어울리는 한국어 해시태그 10개만 쉼표로 구분해 출력. ` +
        `# 없이 단어만. 주제: "${topic}", 철학자: ${phName}, 노래: ${songTitle}`,
      { timeoutMs: 60000 }
    );
    tags = tg
      .replace(/#/g, "")
      .split(/[,\n]/)
      .map((s) => s.replace(/\s+/g, "")) // 공백 제거(해시태그는 한 단어)
      /* 한자(CJK) 섞인 토큰 제거 — 한글/영문/숫자만 허용 */
      .filter((s) => s && s.length >= 2 && s.length <= 20)
      .filter((s) => /^[가-힣A-Za-z0-9]+$/.test(s))
      .filter((s, i, a) => a.indexOf(s) === i)
      .slice(0, 10);
  } catch {}
  if (tags.length < 5) {
    tags = [
      "오둥이감성음악",
      songTitle,
      phName,
      "철학",
      "명언",
      "감성음악",
      "힐링",
      "에세이",
      "사색",
      String(topic || "사유").slice(0, 15),
    ]
      .filter(Boolean)
      .slice(0, 10);
  }

  const emoji = ["🎵", "🌙", "✨", "🍃", "☕"][Math.abs(hashStr(songTitle)) % 5];
  const title = `${emoji} ${songTitle}`;

  return { title, bodyLines, tags, quote, philosopher: ph, category, phName };
}

/** 최종 게시 본문 텍스트(평문) — 명언 + 본문 + 노래 + 출처 */
export function composeBlogText(d) {
  return [
    `『 ${d.phName} 』 ${d.quote.line}`,
    "",
    ...d.bodyLines,
    "",
    `🎧 함께 듣기 — ${d.title.replace(/^\S+\s/, "")}`,
    `#${d.tags.join(" #")}`,
  ].join("\n");
}

/* ===== Puppeteer 네이버 게시 ===== */
function readEnv(key) {
  try {
    const e = readFileSync("D:/.env", "utf8");
    const m = e.match(new RegExp("^" + key + '=\\"?([^\\"\\r\\n]+)', "m"));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

/**
 * 네이버 블로그 글쓰기 자동화 (headful, 세션 유지).
 * SmartEditor ONE 은 버전 변동·iframe 으로 깨지기 쉬움 →
 * 로그인+글쓰기창까지 자동, 본문/제목 입력 시도, 영상·카테고리·발행은
 * 창을 띄워 사장님이 마무리할 수 있게 한다(완전 무인은 보장 못 함).
 * @param {{title,text,videoPath,category,onStep}} o
 */
export async function postToNaverBlog(o) {
  const id = readEnv("NAVER_ID");
  const pw = readEnv("NAVER_PW");
  if (!id || !pw) throw new Error("D:/.env 에 NAVER_ID/NAVER_PW 없음");
  const blogId = readEnv("NAVER_BLOG_ID") || id;
  const step = o.onStep || (() => {});

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch {
    throw new Error("puppeteer-core 미설치 (server에서 npm i puppeteer-core)");
  }
  /* 시스템 설치 Chrome → 없으면 Edge (Win11 기본). 별도 다운로드 없음 */
  const CHROME_CANDIDATES = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const exe =
    (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)
      ? process.env.CHROME_PATH
      : null) || CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("Chrome/Edge 실행파일을 찾지 못했습니다");

  const userDataDir = join(__dirname, ".naver-profile");
  step("브라우저 실행(세션 유지)...");
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: exe,
    userDataDir,
    defaultViewport: null,
    args: ["--start-maximized", "--no-sandbox"],
  });
  try {
    const page = (await browser.pages())[0] || (await browser.newPage());

    /* 로그인 상태 확인 */
    await page.goto("https://www.naver.com", { waitUntil: "domcontentloaded" });
    const loggedIn = await page
      .$('a.MyView-module__link_logout, .MyView-module__nickname')
      .then(Boolean)
      .catch(() => false);

    if (!loggedIn) {
      step("네이버 로그인 시도(캡차/2단계는 창에서 직접 처리)...");
      await page.goto("https://nid.naver.com/nidlogin.login", {
        waitUntil: "domcontentloaded",
      });
      /* 자동 입력 탐지 회피: 값 주입 + input 이벤트 */
      await page.waitForSelector("#id", { timeout: 20000 });
      await page.evaluate(
        (uid, upw) => {
          const set = (sel, v) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.value = v;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          };
          set("#id", uid);
          set("#pw", upw);
        },
        id,
        pw
      );
      await page.click("#log\\.login").catch(() => {});
      /* 로그인 성공(메인/블로그로 이동)까지 최대 3분 — 캡차/2단계 대기 */
      await page
        .waitForFunction(
          () => /naver\.com\/?($|\?|#)/.test(location.href) &&
            !location.href.includes("nidlogin"),
          { timeout: 180000 }
        )
        .catch(() => {});
    } else {
      step("기존 세션 로그인 상태 확인됨.");
    }

    /* 글쓰기 페이지 */
    step("블로그 글쓰기 창 여는 중...");
    await page.goto(
      `https://blog.naver.com/${blogId}?Redirect=Write&`,
      { waitUntil: "domcontentloaded" }
    );
    await new Promise((r) => setTimeout(r, 4000));

    /* SmartEditor ONE 은 #mainFrame iframe 안 */
    const frame =
      page.frames().find((f) => f.url().includes("PostWriteForm")) ||
      page
        .frames()
        .find((f) => /blog\.naver\.com/.test(f.url()) && f !== page.mainFrame()) ||
      page.mainFrame();

    /* 제목/본문 입력 시도 (셀렉터는 SE 버전따라 달라 best-effort) */
    step("제목·본문 입력 시도...");
    const typed = await frame
      .evaluate((title, text) => {
        const tEl =
          document.querySelector(".se-title-text .se-text-paragraph") ||
          document.querySelector('[contenteditable="true"]');
        const bEls = document.querySelectorAll(
          ".se-component.se-text .se-text-paragraph, [contenteditable='true']"
        );
        let ok = false;
        if (tEl) {
          tEl.textContent = title;
          tEl.dispatchEvent(new Event("input", { bubbles: true }));
          ok = true;
        }
        if (bEls && bEls.length) {
          const body = bEls[bEls.length - 1];
          body.textContent = text;
          body.dispatchEvent(new Event("input", { bubbles: true }));
          ok = true;
        }
        return ok;
      }, o.title, o.text)
      .catch(() => false);

    step(
      typed
        ? "제목·본문 입력됨. 영상 첨부·카테고리·발행은 열린 창에서 확인/마무리하세요."
        : "에디터 자동입력이 막혔습니다. 열린 창에 붙여넣기용 텍스트를 사용하세요."
    );

    /* 사장님이 영상 첨부·카테고리(오둥이 감성음악)·발행을 창에서 마무리.
       창을 닫지 않고 유지 → 5분 후 자동 종료(작업 끝나면 사장님이 닫아도 됨) */
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
    return { opened: true, typed };
  } finally {
    await browser.close().catch(() => {});
  }
}
