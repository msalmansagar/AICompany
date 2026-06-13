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
    borderLeft: '2px solid #cbd5e1',
    borderRight: '2px solid #cbd5e1',
    borderTop: isFirst ? '2px solid #cbd5e1' : '1px solid #e2e8f0',
    borderBottom: isLast ? '2px solid #cbd5e1' : 'none',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };
}

function headerStyle(h: number): React.CSSProperties {
  return {
    width: HEADER_W, height: h, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f1f5f9',
    borderRight: '1px solid #cbd5e1',
    padding: '0 8px',
    boxSizing: 'border-box',
  };
}

const roleLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#475569',
  writingMode: 'vertical-rl', transform: 'rotate(180deg)',
  textAlign: 'center', letterSpacing: '0.04em',
  userSelect: 'none', textTransform: 'uppercase',
};

const bodyStyle: React.CSSProperties = {
  flex: 1, height: '100%',
  background: 'rgba(248,250,252,0.6)',
};
