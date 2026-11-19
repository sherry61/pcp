import {AbsoluteFill, Img, staticFile, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import {COLORS} from './theme';
import {Perspective, StatusFlow, type PerspectiveRole} from './Presentation';

type Props = {
  src?: string;
  still?: string;
  start?: number;
  duration: number;
  rate?: number;
  activeStep: number;
  perspective: PerspectiveRole;
};

export const ScreenScene = ({
  src,
  still,
  start = 0,
  duration,
  rate = 1,
  activeStep,
  perspective,
}: Props) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: COLORS.bg}}>
      <StatusFlow active={activeStep} />
      <Perspective role={perspective} />
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 100,
          width: 1680,
          height: 945,
          borderRadius: 24,
          overflow: 'hidden',
          background: COLORS.surface,
          border: '1px solid #C9C9CE',
          boxShadow: '0 32px 90px rgba(0,0,0,0.20)',
        }}
      >
        {still ? (
          <Img
            src={staticFile(still)}
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        ) : (
          <Video
            src={staticFile(src as string)}
            trimBefore={Math.round(start * fps)}
            durationInFrames={Math.round(duration * fps)}
            playbackRate={rate}
            muted
            objectFit="cover"
            style={{width: '100%', height: '100%'}}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
