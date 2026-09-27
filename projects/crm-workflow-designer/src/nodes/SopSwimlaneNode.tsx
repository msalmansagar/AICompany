import type { NodeProps } from '@xyflow/react';

export interface SopSwimlaneNodeData {
  roleName: string;
  laneWidth: number;
  laneHeight: number;
  isFirst: boolean;
  isLast: boolean;
}

export function SopSwimlaneNode({ data }: NodeProps) {
  const d = data as unknown as SopSwimlaneNodeData;
  return (
    <div style={wrapStyle(d.laneWidth, d.laneHeight, d.isFirst, d.isLast)}>
      <div style={headerStyle(d.laneHeight)}>
        <span style={roleLabelStyle}>{d.roleName}</span>
      </div>
      <div style={bodyStyle} />
    </div>
  );
}

const HEADER_W = 160;

function wrapStyle(w: number, h: number, isFirst: boolean, isLast: boolean): React.CSSProperties {
  return {
    width: w, height: h,
    display: 'flex', flexDirection: 'row',
    borderLeft: '2px solid var(--border-strong)',
    borderRight: '2px solid var(--border-strong)',
    borderTop: isFirst ? '2px solid var(--border-strong)' : '1px solid var(--border)',
    borderBottom: isLast ? '2px solid var(--border-strong)' : 'none',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };
}

function headerStyle(h: number): React.CSSProperties {
  return {
    width: HEADER_W, height: h, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-alt)',
    borderRight: '1px solid var(--border-strong)',
    padding: '0 8px',
    boxSizing: 'border-box',
  };
}

const roleLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
  writingMode: 'vertical-rl', transform: 'rotate(180deg)',
  textAlign: 'center', letterSpacing: '0.04em',
  userSelect: 'none', textTransform: 'uppercase',
};

const bodyStyle: React.CSSProperties = {
  flex: 1, height: '100%',
  background: 'var(--lane-bg)',
};
