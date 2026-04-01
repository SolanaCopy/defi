import React from 'react';
import { Composition } from 'remotion';
import { HowItWorks } from './HowItWorks.jsx';
import { PromoClip } from './PromoClip.jsx';

export const RemotionRoot = () => {
  return (
    <>
      {/* Promo Clip — 37 sec */}
      <Composition
        id="PromoClip"
        component={PromoClip}
        durationInFrames={1020}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* Tutorial — ~165 sec */}
      <Composition
        id="HowItWorks"
        component={HowItWorks}
        durationInFrames={4610}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
