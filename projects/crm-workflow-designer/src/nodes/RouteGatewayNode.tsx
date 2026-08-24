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
      <Handle type="target" position={Position.Left} id="in-side" style={handleStyle} />

      <div style={buildDiamondStyle(d.isSelected)}>
        <svg width="52" height="52" viewBox="0 0 52 52">
          <polygon
            points="26,3 49,26 26,49 3,26"
            fill={d.isSelected ? 'var(--warning)' : 'var(--warning)'}
            stroke={d.isSelected ? 'var(--warning)' : 'var(--warning)'}
            strokeWidth={d.isSelected ? 2.5 : 1.5}
          />
          <text x="26" y="31" textAnchor="middle" fontSize="14" fill="var(--warning)" fontWeight="700">
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
      <Handle type="source" position={Position.Right} id="out-side" style={handleStyle} />
    </div>
  );
}

function buildDiamondStyle(isSelected: boolean): React.CSSProperties {
  return {
    position: 'relative',
    width: 52,
    height: 52,
    filter: isSelected ? 'drop-shadow(0 0 4px color-mix(in srgb, var(--accent-route) 60%, transparent))' : undefined,
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
  color: 'var(--warning)',
  background: 'var(--warning-bg)',
  border: '1px solid var(--warning)',
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
  background: 'var(--warning)',
  color: 'var(--text-on-primary)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 3px',
  border: '1.5px solid var(--border)',
};

const handleStyle: React.CSSProperties = {
  background: 'var(--warning)',
  width: 8,
  height: 8,
  border: '2px solid var(--border)',
  borderRadius: '50%',
};
