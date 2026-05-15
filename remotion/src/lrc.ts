/**
 * LRC 파서 — `[mm:ss.xx]가사` 표준.
 * Dart 쪽 lib/services/lrc_parser.dart 의 동등 구현.
 *
 * 사용처: 서버가 .lrc 파일을 받아 props로 주입할 때.
 */
import type { LrcLine } from "./types";

const TIMETAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(content: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const tags: number[] = [];
    let lastIdx = 0;
    TIMETAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIMETAG.exec(raw)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] ?? "0";
      const frac = parseInt(fracStr, 10) / Math.pow(10, fracStr.length);
      tags.push(min * 60 + sec + frac);
      lastIdx = TIMETAG.lastIndex;
    }
    if (tags.length === 0) continue;
    const text = raw.slice(lastIdx).trim();
    if (text.length === 0) continue;
    /* 메타데이터 라인 ([ti:xxx], [ar:xxx]) 무시 */
    if (/^\[(ti|ar|al|by|offset):/i.test(raw)) continue;
    for (const t of tags) {
      lines.push({ t, text });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  return lines;
}
