import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  interpolateColors,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CartoonProps, COLORS, FPS } from "./types";

/**
 * 16:9 1080p 컴포지션.
 * 레이아웃:
 *  - 배경: 같은 1:1 이미지 cover + blur(60px) + brightness(0.4)
 *  - 좌측 중앙: 1:1 이미지 (880×880, 라운드 24px), 미세 ken-burns 줌
 *  - 우측: LRC 가사 스크롤 — 활성 라인 강조 + 상하 페이드 마스크
 *  - 하단 중앙: 노래 타이틀 (그라디언트 오버레이 위)
 */
export const CartoonComposition: React.FC<CartoonProps> = ({
  imageUrl,
  audioUrl,
  title,
  lrc,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  /* 좌측 이미지 ken-burns 시퀀스
     한 사이클 7단계 (시계방향 4모서리 → 전체 → 중앙줌인 → 전체)
     노래 길이 동안 3번 반복. */
  const KEN_BURNS = [
    { z: 1.5, ox: 0, oy: 0 },     // 1. 좌상 줌인
    { z: 1.5, ox: 1, oy: 0 },     // 2. 우상 줌인
    { z: 1.5, ox: 1, oy: 1 },     // 3. 우하 줌인
    { z: 1.5, ox: 0, oy: 1 },     // 4. 좌하 줌인
    { z: 1.0, ox: 0.5, oy: 0.5 }, // 5. 전체화면 줌아웃
    { z: 1.5, ox: 0.5, oy: 0.5 }, // 6. 중앙 줌인
    { z: 1.0, ox: 0.5, oy: 0.5 }, // 7. 전체 줌아웃
  ];
  const REPEAT = 3;
  const totalSteps = KEN_BURNS.length * REPEAT;
  const stepProg = (frame / Math.max(1, durationInFrames)) * totalSteps;
  const stepIdx = Math.min(Math.floor(stepProg), totalSteps - 1);
  const rawT = stepProg - stepIdx;
  const t = rawT * rawT * (3 - 2 * rawT); // smoothstep ease-in-out
  const fromK = KEN_BURNS[stepIdx % KEN_BURNS.length];
  const toK = KEN_BURNS[(stepIdx + 1) % KEN_BURNS.length];
  const zoom = fromK.z + (toK.z - fromK.z) * t;
  const originX = fromK.ox + (toK.ox - fromK.ox) * t;
  const originY = fromK.oy + (toK.oy - fromK.oy) * t;

  /* http(s):// 또는 /로 시작하면 그대로 (외부 URL or absolute web path),
     그 외엔 public/ 의 정적 자산으로 해석 */
  const resolveUrl = (u: string) =>
    /^(https?:|\/\/|\/)/.test(u) ? u : staticFile(u);
  const imgSrc = resolveUrl(imageUrl);
  const audioSrc = resolveUrl(audioUrl);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {/* 배경: 블러된 동일 이미지 */}
      <AbsoluteFill>
        <Img
          src={imgSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(60px) brightness(0.62) saturate(1.15)",
            transform: "scale(1.15)",
          }}
        />
        {/* 살짝만 가라앉히는 오버레이 (배경 이미지가 은은히 비치도록) */}
        <AbsoluteFill style={{ backgroundColor: "rgba(10,11,14,0.28)" }} />
      </AbsoluteFill>

      {/* 좌측 1:1 이미지 + 우측 가사 */}
      <AbsoluteFill
        style={{
          padding: "60px 50px 130px 60px",
          flexDirection: "row",
          alignItems: "center",
          gap: 60,
        }}
      >
        {/* 좌측 1:1 — 880×880 라운드 */}
        <div
          style={{
            width: 880,
            height: 880,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
            flexShrink: 0,
          }}
        >
          <Img
            src={imgSrc}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${zoom})`,
              transformOrigin: `${originX * 100}% ${originY * 100}%`,
            }}
          />
        </div>

        {/* 우측 가사 영역 */}
        <div style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden" }}>
          <LyricsScroller lrc={lrc} />
        </div>
      </AbsoluteFill>

      {/* 하단 그라디언트 + 타이틀 */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          background:
            "linear-gradient(to top, rgba(10,11,14,0.95) 0%, rgba(10,11,14,0.7) 35%, rgba(10,11,14,0) 70%)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            textAlign: "center",
            paddingBottom: 56,
            color: COLORS.textPrimary,
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: -0.5,
            textShadow: "0 4px 24px rgba(0,0,0,0.8)",
          }}
        >
          {title}
        </div>
      </AbsoluteFill>

      {/* 오디오 트랙 */}
      <Audio src={audioSrc} />
    </AbsoluteFill>
  );
};

/**
 * 우측 가사 — 활성 라인이 항상 화면 중앙(약간 위쪽)에 오도록 transform translate.
 * 상하 가장자리 페이드 마스크.
 */
/**
 * 우측 가사 — 프레임 기반 부드러운 스크롤.
 *
 * Remotion은 매 프레임을 독립 렌더하므로 CSS transition이 동작하지 않는다.
 * 라인이 바뀌는 시점에 spring()으로 이전 목표 위치 → 현재 목표 위치를
 * 보간하고, 색/크기도 같은 진행도(prog)로 부드럽게 전환한다.
 */
const LyricsScroller: React.FC<{ lrc: CartoonProps["lrc"] }> = ({ lrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* 한 라인 = 한국어 + 영어 두 줄 (\n) — 고정 높이 */
  const lineHeight = 120;
  const centerOffset = 360; // 활성 라인을 약간 위쪽-중앙에 배치

  const tSec = frame / fps;
  const activeIdx = findActiveLrcIndex(lrc, tSec);

  const targetForIndex = (idx: number) =>
    idx < 0 ? centerOffset : -(idx * lineHeight) + centerOffset;

  /* 활성 라인이 시작된 프레임 → 그 시점부터 ~0.5초 spring */
  const activeStartFrame =
    activeIdx >= 0 ? Math.round(lrc[activeIdx].t * fps) : 0;
  const prog = spring({
    frame: frame - activeStartFrame,
    fps,
    durationInFrames: Math.round(0.5 * fps),
    config: { damping: 200, mass: 0.7 },
  });

  const fromY = targetForIndex(activeIdx - 1);
  const toY = targetForIndex(activeIdx);
  const offsetY =
    activeIdx <= 0 ? toY : interpolate(prog, [0, 1], [fromY, toY]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
      }}
    >
      <div style={{ transform: `translateY(${offsetY}px)` }}>
        {lrc.map((line, i) => {
          /* 활성도: 들어오는 라인 0→1, 나가는 직전 라인 1→0, 나머지 0 */
          let activeness = 0;
          if (i === activeIdx) activeness = activeIdx <= 0 ? 1 : prog;
          else if (i === activeIdx - 1) activeness = 1 - prog;

          const fontSize = interpolate(activeness, [0, 1], [30, 38]);
          const color = interpolateColors(
            activeness,
            [0, 1],
            [COLORS.textFaint, COLORS.accentSoft]
          );
          return (
            <div
              key={i}
              style={{
                height: lineHeight,
                display: "flex",
                alignItems: "center",
                fontSize,
                fontWeight: activeness > 0.5 ? 700 : 500,
                color,
                lineHeight: 1.25,
                whiteSpace: "pre-line",
                paddingLeft: 8,
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function findActiveLrcIndex(lines: CartoonProps["lrc"], tSec: number): number {
  if (lines.length === 0) return -1;
  let lo = 0,
    hi = lines.length - 1,
    ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= tSec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
