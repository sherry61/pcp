import {AbsoluteFill, Sequence} from 'remotion';
import {Cover, type PerspectiveRole} from './Presentation';
import {ScreenScene} from './ScreenScene';
import {COLORS} from './theme';
import {FPS} from './timing';

export type PartScene = {
  src?: string;
  still?: string;
  start?: number;
  duration: number;
  perspective: PerspectiveRole;
};
export const COVER_SECONDS = 2.5;

export const Part = ({
  coverActive,
  activeStep,
  scenes,
}: {
  coverActive: number;
  activeStep: number;
  scenes: PartScene[];
}) => {
  let cursor = Math.round(COVER_SECONDS * FPS);
  const items = scenes.map((scene) => {
    const durationInFrames = Math.round(scene.duration * FPS);
    const from = cursor;
    cursor += durationInFrames;
    return {scene, from, durationInFrames};
  });

  return (
    <AbsoluteFill style={{background: COLORS.bg}}>
      <Sequence from={0} durationInFrames={Math.round(COVER_SECONDS * FPS)}>
        <Cover active={coverActive} />
      </Sequence>
      {items.map(({scene, from, durationInFrames}, index) => (
        <Sequence key={index} from={from} durationInFrames={durationInFrames}>
          <ScreenScene
            src={scene.src}
            still={scene.still}
            start={scene.start ?? 0}
            duration={scene.duration}
            activeStep={activeStep}
            perspective={scene.perspective}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
