/**
 * refresh token 재발급 (일회성).
 * .env 의 CLOUD_OAUTH2_ID / CLOUD_OAUTH2_PW (데스크톱 OAuth 클라이언트) 사용.
 *
 * 실행: node get-refresh-token.mjs
 *  → 브라우저 자동 오픈 → Google 동의 → refresh token 받아 .env CLOUD_REFRESH_TOKEN 갱신.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { exec } from "node:child_process";

const ENV_PATH = "D:/.env";
const PORT = 4100;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

const env = readFileSync(ENV_PATH, "utf8");
const g = (k) => {
  const m = env.match(new RegExp("^" + k + '=\\"?([^\\"\\r\\n]+)', "m"));
  return m ? m[1].trim() : "";
};
const CLIENT_ID = g("CLOUD_OAUTH2_ID");
const CLIENT_SECRET = g("CLOUD_OAUTH2_PW");
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ .env 에 CLOUD_OAUTH2_ID / CLOUD_OAUTH2_PW 없음");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) {
    res.end("인증 거부됨: " + err + " — 이 창을 닫아도 됩니다.");
    console.error("❌ 사용자가 동의를 거부했습니다:", err);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.end("코드 없음. 이 창을 닫고 다시 시도하세요.");
    return;
  }
  try {
    const tk = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    });
    const j = await tk.json();
    if (!j.refresh_token) {
      res.end("refresh_token 미발급. 터미널 로그 확인.");
      console.error("❌ refresh_token 없음:", JSON.stringify(j));
      server.close();
      process.exit(1);
    }
    /* .env 백업 후 CLOUD_REFRESH_TOKEN 라인만 교체 */
    copyFileSync(ENV_PATH, ENV_PATH + ".bak");
    const cur = readFileSync(ENV_PATH, "utf8");
    const next = cur.match(/^CLOUD_REFRESH_TOKEN=.*$/m)
      ? cur.replace(/^CLOUD_REFRESH_TOKEN=.*$/m, `CLOUD_REFRESH_TOKEN="${j.refresh_token}"`)
      : cur.trimEnd() + `\nCLOUD_REFRESH_TOKEN="${j.refresh_token}"\n`;
    writeFileSync(ENV_PATH, next);
    res.end("✅ refresh token 발급 완료! 이 창을 닫고 터미널로 돌아가세요.");
    console.log("✅ refresh token 발급 + .env 갱신 완료 (.env.bak 백업됨)");
    console.log("   token scope:", j.scope);
    server.close();
    process.exit(0);
  } catch (e) {
    res.end("교환 실패: " + e.message);
    console.error("❌ 토큰 교환 실패:", e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log("아래 URL을 브라우저에서 열어 Google 계정 동의:");
  console.log(authUrl.toString());
  console.log("=".repeat(60));
  exec(`cmd /c start "" "${authUrl}"`); // 자동 오픈 시도
});
