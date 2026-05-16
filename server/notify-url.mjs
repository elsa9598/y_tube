/**
 * ngrok 로컬 API(:4040)에서 현재 외부 URL을 읽어 텔레그램으로 전송.
 * start-y-tube.bat 이 서버+ngrok 띄운 뒤 호출.
 *
 * .env(D:\.env): TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_ID(chat_id), WEB_USER, WEB_PASS
 */
import { readFileSync } from "node:fs";

const env = readFileSync("D:/.env", "utf8");
const g = (k) => {
  const m = env.match(new RegExp("^" + k + '=\\"?([^\\"\\r\\n]+)', "m"));
  return m ? m[1].trim() : "";
};
const TOKEN = g("TELEGRAM_BOT_TOKEN");
const CHAT = g("TELEGRAM_BOT_ID");
const USER = g("WEB_USER");
const PASS = g("WEB_PASS");

async function getNgrokUrl(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch("http://localhost:4040/api/tunnels");
      const j = await r.json();
      const u = (j.tunnels || [])
        .map((t) => t.public_url)
        .find((x) => x && x.startsWith("https"));
      if (u) return u;
    } catch {}
    await new Promise((s) => setTimeout(s, 1500));
  }
  return null;
}

const url = await getNgrokUrl();
if (!url) {
  console.error("❌ ngrok URL을 못 찾음 (ngrok 미기동?)");
  process.exit(1);
}

const text =
  `🎬 오둥이 하루 — 렌더 서버 ON\n\n` +
  `📲 접속: ${url}\n` +
  `🔑 ID: ${USER}\n🔑 PW: ${PASS}\n\n` +
  `※ ngrok 안내화면 뜨면 "Visit Site" 한 번 누르세요.\n` +
  `※ 이 주소는 재시작 시 바뀝니다 (항상 이 메시지의 최신 주소 사용).`;

const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
});
const j = await resp.json();
console.log(j.ok ? `✅ 텔레그램 전송: ${url}` : `❌ ${JSON.stringify(j)}`);
process.exit(j.ok ? 0 : 1);
