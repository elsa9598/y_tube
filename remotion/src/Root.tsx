import React from "react";
import { Composition } from "remotion";
import { CartoonComposition } from "./Composition";
import {
  CartoonPropsSchema,
  FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./types";

/**
 * Remotion Studio + render CLI에서 인식하는 컴포지션 등록.
 * id="Cartoon"이 `npx remotion render Cartoon out/...` 의 첫 인자.
 *
 * defaultProps는 Studio 미리보기용. 실제 렌더는 --props=... 로 주입됨.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Cartoon"
        component={CartoonComposition}
        schema={CartoonPropsSchema}
        durationInFrames={FPS * 30}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{
          imageUrl: "https://picsum.photos/seed/odung/1080/1080",
          audioUrl: "https://www.kozco.com/tech/piano2.wav",
          durationSec: 30,
          title: "오둥이의 하루 — 미리보기",
          lrc: [
            { t: 0, text: "이 라인은 0초부터" },
            { t: 3, text: "두 번째 가사" },
            { t: 6, text: "세 번째 가사" },
            { t: 9, text: "네 번째 가사" },
            { t: 12, text: "다섯 번째 가사" },
            { t: 15, text: "여섯 번째 가사" },
            { t: 18, text: "일곱 번째 가사" },
            { t: 21, text: "여덟 번째 가사" },
            { t: 24, text: "아홉 번째 가사" },
            { t: 27, text: "마지막 라인" },
          ],
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(1, Math.round(props.durationSec * FPS)),
        })}
      />
    </>
  );
};
