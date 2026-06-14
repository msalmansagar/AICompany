import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface RouteGatewayData extends Record<string, unknown> {
  outcomeName: string;
  outcomeId: string;
  routeCount: number;
  isSelected: boolean;
}

export function RouteGatewayNode({ data }: NodeProps) {
  const d = data as RouteGatewayData;

  return (
    <div style={wrapperStyle}>
      <Handle type="target" position={Position.Top} id="in" style={handleStyle} />

      <div style={buildDiamondStyle(d.isSelected)}>
        <svg width="52" height="52" viewBox="0 0 52 52">
          <polygon
            points="26,3 49,26 26,49 3,26"
            fill={d.isSelected ? '#fef3c7' : '#fffbeb'}
            stroke={d.isSelected ? '#b45309' : '#d97706'}
            strokeWidth={d.isSelected ? 2.5 : 1.5}
          />
          <text x="26" y="31" textAnchor="middle" fontSize="14" fill="#92400e" fontWeight="700">
            ⋈
          </text>
        </svg>
        {d.routeCount > 0 && (
          <div style={countBadge}>{d.routeCount}</div>
        )}
      </div>

      <div style={labelStyle} title={d.outcomeName}>
        {d.outcomeName}
      </div>

      <Handle type="source" position={Position.Bottom} id="out" style={handleStyle} />
    </div>
  );
}

function buildDiamondStyle(isSelected: boolean): React.CSSProperties {
  return {
    position: 'relative',
    width: 52,
    height: 52,
    filter: isSelected ? 'drop-shadow(0 0 4px rgba(217,119,6,0.6))' : undefined,
    cursor: 'pointer',
  };
}

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  position: 'relative',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#92400e',
  background: '#fef3c7',
  border: '1px solid #fde68a',
  borderRadius: 4,
  padding: '1px 6px',
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'center',
};

const countBadge: React.CSSProperties = {
  position: 'absolute',
  top: -4,
  right: -4,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  background: '#d97706',
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 3px',
  border: '1.5px solid #fff',
};

const handleStyle: React.CSSProperties = {
  background: '#d97706',
  width: 8,
  height: 8,
  border: '2px solid #fff',
  borderRadius: '50%',
};
