/**
 * 유튜브 업로드 (Node) — refresh token으로 동의 화면 없이 access token 갱신
 * → YouTube Data API v3 resumable upload (8MB 청크, 진행률 콜백).
 *
 * lib/services/youtube_uploader.dart 의 Node 포팅.
 */
import { createReadStream, statSync } from "node:fs";
import { Secrets } from "./secrets.mjs";

const RESUMABLE_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos" +
  "?uploadType=resumable&part=snippet,status";
const CHUNK = 8 * 1024 * 1024;

async function accessToken() {
  const resp = await fetch(Secrets.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Secrets.googleClientId,
      client_secret: Secrets.googleClientSecret,
      refresh_token: Secrets.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    throw new Error(`토큰 갱신 실패 (HTTP ${resp.status}): ${await resp.text()}`);
  }
  const json = await resp.json();
  if (!json.access_token) throw new Error(`access_token 없음: ${JSON.stringify(json)}`);
  return json.access_token;
}

/**
 * @param {string} filePath  업로드할 mp4
 * @param {{title,description,tags,privacyStatus}} meta
 * @param {(progress:number,status:string)=>void} onProgress  0~100
 * @returns {Promise<string>}  watch URL
 */
export async function uploadToYouTube(filePath, meta, onProgress = () => {}) {
  const total = statSync(filePath).size;

  onProgress(2, "🔐 Google 인증 중...");
  const token = await accessToken();

  /* 1. resumable 세션 시작 */
  onProgress(5, "☁️ 업로드 세션 생성...");
  const body = JSON.stringify({
    snippet: {
      title: meta.title,
      description: meta.description ?? "",
      tags: meta.tags ?? [],
      categoryId: "10", // Music
    },
    status: {
      privacyStatus: meta.privacyStatus ?? "private",
      selfDeclaredMadeForKids: false,
    },
  });
  const init = await fetch(RESUMABLE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(total),
    },
    body,
  });
  if (!init.ok) {
    throw new Error(`세션 생성 실패 (HTTP ${init.status}): ${await init.text()}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("업로드 URL(Location 헤더) 없음");

  /* 2. 청크 PUT */
  let sent = 0;
  const stream = createReadStream(filePath, { highWaterMark: CHUNK });
  for await (const chunk of stream) {
    const end = sent + chunk.length;
    const resp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${sent}-${end - 1}/${total}`,
      },
      body: chunk,
    });
    sent = end;
    const pct = Math.min(100, Math.max(5, (sent / total) * 95));
    onProgress(pct, `⬆️ 업로드 ${((sent / total) * 100).toFixed(0)}%`);

    if (resp.status === 200 || resp.status === 201) {
      const json = await resp.json();
      onProgress(100, "✅ 업로드 완료");
      return json.id ? `https://youtu.be/${json.id}` : "업로드 완료 (ID 미확인)";
    }
    if (resp.status === 308) continue; // Resume Incomplete
    throw new Error(`업로드 실패 (HTTP ${resp.status}): ${await resp.text()}`);
  }
  throw new Error("업로드가 완료 응답 없이 종료됨");
}
