import React from "react";
import { Composition } from "remotion";
import { CoindlePromo } from "./CoindlePromo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CoindlePromo"
      component={CoindlePromo}
      durationInFrames={1050}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
