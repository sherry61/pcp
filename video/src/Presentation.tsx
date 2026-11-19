import {Fragment} from 'react';
import {AbsoluteFill} from 'remotion';
import {COLORS, FONT} from './theme';

export type PerspectiveRole = '买方视角' | '卖方视角' | '审计方视角';

export const STEPS = [
  {n: '01', label: '上链登记'},
  {n: '02', label: '资产管理'},
  {n: '03', label: '交易市场'},
  {n: '04', label: '资产交付'},
] as const;

export const Cover = ({active}: {active: number}) => (
  <AbsoluteFill style={{background: COLORS.bg, fontFamily: FONT}}>
    <div style={{position: 'absolute', left: 160, top: 250, width: 900}}>
      <h1
        style={{
          margin: 0,
          fontSize: 100,
          lineHeight: 1.06,
          fontWeight: 700,
          letterSpacing: '-0.045em',
        }}
      >
        基于区块链的
        <br />
        数字资产流程系统
      </h1>
      <p style={{margin: '24px 0 0', fontSize: 28, color: COLORS.gray, letterSpacing: '0.01em'}}>
        全流程演示·基于多方安全计算场景
      </p>
    </div>

    <div style={{position: 'absolute', right: 160, top: 300, width: 520}}>
      {STEPS.map((step, i) => {
        const isActive = i + 1 === active;
        return (
          <div
            key={step.n}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              marginBottom: 28,
              position: 'relative',
            }}
          >
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  left: -24,
                  width: 4,
                  height: 54,
                  background: COLORS.blue,
                  borderRadius: 2,
                }}
              />
            )}
            <span
              style={{
                width: 36,
                fontSize: isActive ? 20 : 16,
                fontWeight: 700,
                color: isActive ? COLORS.blue : COLORS.gray,
              }}
            >
              {step.n}
            </span>
            <span
              style={{
                fontSize: isActive ? 54 : 40,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '-0.03em',
                color: isActive ? COLORS.ink : COLORS.gray,
                opacity: isActive ? 1 : 0.55,
              }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  </AbsoluteFill>
);

export const StatusFlow = ({active}: {active: number}) => (
  <div
    style={{
      position: 'absolute',
      left: 120,
      top: 26,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}
  >
    {STEPS.map((step, i) => {
      const isActive = i + 1 === active;
      const done = i + 1 < active;
      return (
        <Fragment key={step.n}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingBottom: 4,
              borderBottom: isActive ? `2px solid ${COLORS.blue}` : '2px solid transparent',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: isActive ? COLORS.blue : done ? COLORS.gray : '#B0B0B5',
              }}
            >
              {step.n}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? COLORS.ink : done ? COLORS.gray : '#B0B0B5',
              }}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && <span style={{width: 30, height: 1, background: '#D2D2D7'}} />}
        </Fragment>
      );
    })}
  </div>
);

export const Perspective = ({role}: {role: PerspectiveRole}) => {
  const dot =
    role === '审计方视角' ? '#00A878' : role === '买方视角' ? COLORS.blue : COLORS.gray;
  return (
    <div
      style={{
        position: 'absolute',
        right: 120,
        top: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: '#FFFFFF',
        border: '1px solid #D2D2D7',
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.gray,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <span style={{width: 7, height: 7, borderRadius: '50%', background: dot}} />
      {role}
    </div>
  );
};
