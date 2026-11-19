import {Composition} from 'remotion';
import {Registration} from './Registration';
import {Part2, PART2_SECONDS} from './Part2';
import {Part3, PART3_SECONDS} from './Part3';
import {Part4, PART4_SECONDS} from './Part4';
import {FPS, TOTAL_FRAMES} from './timing';

export const RemotionRoot = () => (
  <>
    <Composition
      id="Registration"
      component={Registration}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="Part2"
      component={Part2}
      durationInFrames={Math.round(PART2_SECONDS * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="Part3"
      component={Part3}
      durationInFrames={Math.round(PART3_SECONDS * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="Part4"
      component={Part4}
      durationInFrames={Math.round(PART4_SECONDS * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </>
);
