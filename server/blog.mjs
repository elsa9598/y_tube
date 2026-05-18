/**
 * 네이버 블로그 — 본문 생성(100% 로컬 Ollama) + 게시(Puppeteer 브라우저 자동화).
 *
 * - 본문 생성: 로컬 Ollama(gemma) 만 사용. 외부 클라우드 AI 금지(회사 원칙).
 * - 게시: 공식 API는 영상 첨부·카테고리 지정 불가 → 브라우저 자동화.
 *   네이버는 자동화 탐지가 강함 → headful + userDataDir 로 세션 유지,
 *   캡차/2단계 인증은 첫 회 사장님이 직접(창이 떠 있음) 처리.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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
        options: { temperature: 0.5, num_predict: 900 },
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

/* 한국어 순수성: 일본어 카나(ひらがな/カタカナ) 또는 한자(CJK) 가 있으면 false.
   한글=가-힣, 한자=一-鿿, 카나=぀-ヿ */
function isKoreanClean(s) {
  return !/[぀-ヿ一-鿿㐀-䶿]/.test(s);
}

/* 한국어로만 나올 때까지 최대 maxTry 회 재생성 (qwen 언어 드리프트 방어) */
async function ollamaKorean(buildPrompt, maxTry = 4) {
  let last = "";
  for (let i = 0; i < maxTry; i++) {
    const strict =
      i === 0
        ? ""
        : "\n\n‼️ 경고: 직전 출력에 한자/일본어가 섞였습니다. " +
          "이번엔 한글과 기본 문장부호·이모지만 사용하세요. 한자(漢字)·일본어·중국어 단어 절대 금지.";
    let out = "";
    try {
      out = await ollamaGenerate(buildPrompt(strict));
    } catch {
      out = "";
    }
    last = out;
    if (out && isKoreanClean(out)) return out;
  }
  /* 끝까지 실패 → 한자/카나 줄만 제거하고 남은 한국어 라인만 사용 */
  return last
    .split(/\r?\n/)
    .filter((l) => l.trim() && isKoreanClean(l))
    .join("\n");
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

  const buildPrompt = (strict) =>
    `당신은 한국어 원어민 감성 에세이 작가입니다.\n` +
    `‼️ 출력은 100% 한국어. 한자(漢字)·일본어·중국어 글자 절대 사용 금지. 영어 단어 최소화.\n\n` +
    `이 글의 주제는 오직 다음 하나입니다 — 절대 다른 소재로 새지 마세요:\n` +
    `★ 주제: "${topic}"\n\n` +
    `이 주제를 ${phName}의 철학으로 풀어 씁니다.\n` +
    `참고 명언: "${quote.line}" (${phName})\n\n` +
    `규칙:\n` +
    `1) 처음부터 끝까지 "${topic}" 에 대한 글이어야 함. 노래·동물·날씨 등 주제와 무관한 이야기로 빠지지 말 것.\n` +
    `2) ${phName}의 사상으로 이 주제를 깊이 있게, 쉽게 해석.\n` +
    `3) 주제에 맞는 일상적인 짧은 이야기 예시 1개.\n` +
    `4) 따뜻하고 감성적인 톤, 이모지 적당히. 한 문장마다 줄바꿈, 총 8~16줄.\n` +
    `5) 제목·태그·머리말·번호 쓰지 말고 본문 문장만.\n` +
    `6) 마지막 한 줄만 노래 "${songTitle}"를 들으며 마무리.\n` +
    strict +
    `\n\n"${topic}" 에 대한 한국어 본문:`;

  const raw = await ollamaKorean(buildPrompt);

  let bodyLines = raw
    .replace(/^본문\s*[:：]?\s*/i, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\[(제목|태그|본문)\]/.test(l))
    .filter((l) => !/한국어 본문\s*[:：]?$/.test(l)) // 프롬프트 꼬리 에코 제거
    .filter((l) => !/^[★▶]|^주제\s*[:：]/.test(l))
    .filter(isKoreanClean) // 한자/일본어 섞인 줄 버림
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

/* Windows 클립보드에 텍스트 복사 (에디터 자동입력 실패 시 Ctrl+V 안전장치) */
function setWindowsClipboard(text) {
  try {
    const tmp = join(tmpdir(), `ytube_clip_${Date.now()}.txt`);
    writeFileSync(tmp, text, "utf8");
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${tmp}')`,
      ],
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
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
  if (!id) throw new Error("D:/.env 에 NAVER_ID 없음");
  /* 자격증명 자동입력은 하지 않음(캡차 유발). 로그인은 사장님이 1회 수동. */
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
  step("브라우저 실행(세션 유지·자동화 흔적 숨김)...");
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: exe,
    userDataDir,
    defaultViewport: null,
    /* 네이버 자동화 탐지 회피: --enable-automation 제거 + webdriver 숨김 */
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
    ],
  });

  /* 본문은 무조건 클립보드에 먼저 — 자동입력 막혀도 Ctrl+V 로 끝낼 수 있게 */
  const clipText = `${o.title}\n\n${o.text}`;
  const clipOk = setWindowsClipboard(clipText);

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page
      .evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      })
      .catch(() => {});

    /* 로그인 상태 확인 (세션 재사용) */
    await page.goto("https://www.naver.com", { waitUntil: "domcontentloaded" });
    let loggedIn = await page
      .$eval("body", (b) => /로그아웃|MyView-module__nickname/.test(b.innerHTML))
      .catch(() => false);

    if (!loggedIn) {
      /* ⚠️ 자동 입력 금지 — 자동입력이 캡차/차단을 부른다.
         사장님이 창에서 직접 1회 로그인(+캡차/2단계). 이후 세션 재사용 → 무인. */
      step(
        "🔑 열린 창에서 네이버에 직접 로그인하세요 (최초 1회만, 캡차 포함). 완료되면 자동 진행됩니다."
      );
      await page.goto("https://nid.naver.com/nidlogin.login", {
        waitUntil: "domcontentloaded",
      });
      const ok = await page
        .waitForFunction(
          () =>
            !location.href.includes("nidlogin") &&
            !location.href.includes("nid.naver.com"),
          { timeout: 300000, polling: 1000 }
        )
        .then(() => true)
        .catch(() => false);
      if (!ok) {
        step("로그인 미완료(5분 초과). 다시 시도해주세요.");
        await new Promise((r) => setTimeout(r, 8000));
        return { opened: true, typed: false, loggedIn: false };
      }
      step("로그인 완료 — 세션 저장됨(다음부터 로그인 생략).");
    } else {
      step("기존 세션 로그인 확인됨(로그인 생략).");
    }

    /* 글쓰기 페이지 */
    step("블로그 글쓰기 창 여는 중...");
    await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write&`, {
      waitUntil: "domcontentloaded",
    });
    await new Promise((r) => setTimeout(r, 5000));

    /* SmartEditor ONE iframe 탐색 */
    let frame = page
      .frames()
      .find((f) => /PostWriteForm|postwrite/i.test(f.url()));
    if (!frame) {
      const fEl = await page.$("iframe#mainFrame");
      if (fEl) frame = await fEl.contentFrame();
    }
    if (!frame) frame = page.mainFrame();
    await new Promise((r) => setTimeout(r, 2000));

    /* '작성 중인 글' 복구 팝업이 뜨면 취소 */
    await frame
      .evaluate(() => {
        const btns = [...document.querySelectorAll("button, a")];
        const cancel = btns.find((b) =>
          /취소|새로 작성|닫기/.test(b.textContent || "")
        );
        if (cancel) cancel.click();
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    /* 클릭 → 전체선택 → 평문 붙여넣기. 타이핑은 서식(취소선 등) 오염되므로 X */
    const pasteInto = async (el, value) => {
      await el.click({ delay: 30 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      setWindowsClipboard(value);
      await new Promise((r) => setTimeout(r, 250));
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyA");
      await page.keyboard.press("KeyV");
      await page.keyboard.up("Control");
      await new Promise((r) => setTimeout(r, 500));
    };

    /* 제목: 평문 붙여넣기 (SE-ONE 은 textContent 주입 무시) */
    step("제목 입력(붙여넣기)...");
    let typedTitle = false;
    for (const sel of [
      ".se-section-documentTitle .se-text-paragraph",
      ".se-documentTitle .se-text-paragraph",
      ".se-placeholder.__se_placeholder",
      ".se_textarea",
    ]) {
      const el = await frame.$(sel).catch(() => null);
      if (el) {
        await pasteInto(el, o.title);
        typedTitle = true;
        break;
      }
    }

    /* 본문: 평문 붙여넣기 (줄바꿈 보존, 서식 오염 없음) */
    step("본문 입력(붙여넣기)...");
    let typedBody = false;
    let bodyEl = null;
    for (const sel of [
      ".se-section-text .se-text-paragraph",
      ".se-component.se-text .se-text-paragraph",
      ".se-content .se-text-paragraph",
    ]) {
      bodyEl = await frame.$(sel).catch(() => null);
      if (bodyEl) break;
    }
    if (bodyEl) {
      await pasteInto(bodyEl, o.text);
      typedBody = true;
    }

    const typed = typedTitle && typedBody;
    step(
      (typed
        ? "✅ 제목·본문 자동 입력됨. "
        : "⚠️ 에디터 자동입력 일부 실패. 본문이 클립보드에 있으니 본문칸 클릭 후 Ctrl+V 하세요. ") +
        (clipOk ? "(클립보드에 제목+본문 복사됨) " : "") +
        "이제 창에서 ① 카테고리 '오둥이 감성음악' ② 동영상 첨부 ③ 발행 을 마무리하세요. (10분간 창 유지)"
    );

    /* 수동 보정용으로 제목+본문 다시 클립보드에 (붙여넣기 중 덮였으므로 복원) */
    setWindowsClipboard(clipText);

    /* 사장님이 카테고리·영상·발행 마무리 — 창 10분 유지 */
    await new Promise((r) => setTimeout(r, 10 * 60 * 1000));
    return { opened: true, typed, loggedIn: true, clip: clipOk };
  } finally {
    await browser.close().catch(() => {});
  }
}
