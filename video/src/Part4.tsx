import {Part, type PartScene} from './Part';

const SCENES: PartScene[] = [
  {src: 'part4a.webm', duration: 7.9, perspective: '买方视角'},
  {src: 'part4b.webm', duration: 10.9, perspective: '卖方视角'},
  {src: 'part4c.webm', duration: 7.7, perspective: '卖方视角'},
  {src: 'part4d.webm', duration: 9.4, perspective: '审计方视角'},
  {still: 'result.png', duration: 4.5, perspective: '买方视角'},
];

export const PART4_SECONDS = 2.5 + 7.9 + 10.9 + 7.7 + 9.4 + 4.5;
export const Part4 = () => <Part coverActive={4} activeStep={4} scenes={SCENES} />;
