export const FPS = 30;
export type Scene = {start: number; duration: number; rate: number};

export const TITLE_SECONDS = 4.0;

export const SCENES: Scene[] = [
  {start: 0.4, duration: 5.8, rate: 1},
  {start: 8.2, duration: 5.3, rate: 1},
  {start: 13.5, duration: 7.8, rate: 1.15},
  {start: 20.5, duration: 6.1, rate: 1.5},
  {start: 26.6, duration: 6.7, rate: 1},
];

export const TOTAL_SECONDS =
  TITLE_SECONDS + SCENES.reduce((sum, s) => sum + s.duration / s.rate, 0);
export const TOTAL_FRAMES = Math.round(TOTAL_SECONDS * FPS);
