import {Part, type PartScene} from './Part';

const SCENES: PartScene[] = [
  {src: 'part2a.webm', duration: 5.5, perspective: '卖方视角'},
  {src: 'part2b.webm', duration: 6.0, perspective: '卖方视角'},
];

export const PART2_SECONDS = 2.5 + 5.5 + 6.0;
export const Part2 = () => <Part coverActive={2} activeStep={2} scenes={SCENES} />;
