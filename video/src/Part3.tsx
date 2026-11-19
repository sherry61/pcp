import {Part, type PartScene} from './Part';

const SCENES: PartScene[] = [
  {src: 'part3a.webm', duration: 17.3, perspective: '买方视角'},
  {src: 'part3b.webm', duration: 7.0, perspective: '卖方视角'},
];

export const PART3_SECONDS = 2.5 + 17.3 + 7.0;
export const Part3 = () => <Part coverActive={3} activeStep={3} scenes={SCENES} />;
