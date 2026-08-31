import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { routeLabelPair } from '@/styles/surfacePairs';

export interface RouteGatewayData extends Record<string, unknown> {
  outcomeName: string;
  outcomeId: string;
  routeCount: number;
  isSelected: boolean;
}

/**
 * The decision gateway (redesigned, CWFD-019 PR1): a small OUTLINED diamond
 * in BPMN's visual discipline — routing logic, not a business task, so it is
 * deliberately lighter and smaller than a step card. The decision's business
 * name sits ABOVE the diamond, and the route count lives inside it,
 * accent-on-surface so it reads in every theme — the old solid diamond drew
 * its glyph in its own fill colour and had never shown anything.
 *
 * Virtual on every canvas: no Dataverse record, selection maps to the
 * decision (outcome) it draws.
 */
export function RouteGatewayNode({ data }: NodeProps) {
  const d = data as RouteGatewayData;
  const labelPair = routeLabelPair('conditional');

  return (
    <div
      style={wrapperStyle}
      title={`${d.outcomeName} — ${d.routeCount} route${d.routeCount === 1 ? '' : 's'}. Click to open the decision.`}
    >
      <Handle type="target" position={Position.Top} id="in" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="in-side" style={handleStyle} />

      <div
        style={{
          ...labelChipStyle,
          background: labelPair.background,
          color: labelPair.foreground,
          border: `1px solid ${labelPair.border}`,
        }}
      >
        {d.outcomeName || 'Decision'}
      </div>

      <div style={diamondBoxStyle(d.isSelected)}>
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
          <polygon
            points="22,2.5 41.5,22 22,41.5 2.5,22"
            fill="var(--surface)"
            stroke={d.isSelected ? 'var(--primary)' : 'var(--warning)'}
            strokeWidth={d.isSelected ? 2.5 : 2}
            strokeLinejoin="round"
          />
          <text
            x="22"
            y="27"
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill={d.isSelected ? 'var(--primary)' : 'var(--warning)'}
          >
            {d.routeCount > 0 ? d.routeCount : '◈'}
          </text>
        </svg>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="out-side" style={handleStyle} />
    </div>
  );
}

function diamondBoxStyle(isSelected: boolean): React.CSSProperties {
  return {
    position: 'relative',
    width: 44,
    height: 44,
    cursor: 'pointer',
    filter: isSelected
      ? 'drop-shadow(0 0 4px color-mix(in srgb, var(--primary) 55%, transparent))'
      : 'drop-shadow(0 1px 2px color-mix(in srgb, var(--text) 18%, transparent))',
  };
}

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  position: 'relative',
};

const labelChipStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 4,
  padding: '1px 7px',
  maxWidth: 150,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'center',
};

const handleStyle: React.CSSProperties = {
  background: 'var(--warning)',
  width: 8,
  height: 8,
  border: '2px solid var(--border)',
  borderRadius: '50%',
};
