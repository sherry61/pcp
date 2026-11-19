import {AbsoluteFill, Sequence} from 'remotion';
import {Cover} from './Presentation';
import {ScreenScene} from './ScreenScene';
import {COLORS} from './theme';
import {FPS, SCENES, TITLE_SECONDS} from './timing';

export const Registration = () => {
  let cursor = Math.round(TITLE_SECONDS * FPS);
  const items = SCENES.map((scene) => {
    const durationInFrames = Math.round((scene.duration / scene.rate) * FPS);
    const from = cursor;
    cursor += durationInFrames;
    return {scene, from, durationInFrames};
  });

  return (
    <AbsoluteFill style={{background: COLORS.bg}}>
      <Sequence from={0} durationInFrames={Math.round(TITLE_SECONDS * FPS)}>
        <Cover active={1} />
      </Sequence>
      {items.map(({scene, from, durationInFrames}, index) => (
        <Sequence key={index} from={from} durationInFrames={durationInFrames}>
          <ScreenScene
            src="registration.webm"
            start={scene.start}
            duration={scene.duration}
            rate={scene.rate}
            activeStep={1}
            perspective="卖方视角"
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
