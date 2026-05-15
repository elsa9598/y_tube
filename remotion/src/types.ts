import { z } from "zod";

export const LrcLineSchema = z.object({
  /** 시작 시각(초) — LRC `[mm:ss.xx]` 를 초로 변환 */
  t: z.number().nonnegative(),
  /** 가사 텍스트 */
  text: z.string(),
});
export type LrcLine = z.infer<typeof LrcLineSchema>;

export const CartoonPropsSchema = z.object({
  /** 1:1 정사각 이미지 URL (file:// 또는 http://). 좌측 + 블러 배경 양쪽에 사용 */
  imageUrl: z.string().min(1),
  /** MP3 오디오 URL */
  audioUrl: z.string().min(1),
  /** 노래 길이(초) — 비디오 총 길이 결정 */
  durationSec: z.number().positive(),
  /** 노래 타이틀 (하단 중앙 표시) */
  title: z.string().default("오둥이의 하루"),
  /** LRC 가사 라인 배열 */
  lrc: z.array(LrcLineSchema).default([]),
});
export type CartoonProps = z.infer<typeof CartoonPropsSchema>;

export const FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

export const COLORS = {
  bg: "#0A0B0E",
  surface: "#14161B",
  accent: "#FB6357",
  accentSoft: "#FFB4AC",
  textPrimary: "#F2F4F7",
  textDim: "#8A95A3",
  textFaint: "#5C6473",
} as const;
