import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ViewOutcomeData } from '../services/WorkflowGraphBuilder';

export const DECISION_W = 140;
export const DECISION_H = 60;

const MX = DECISION_W / 2;
const MY = DECISION_H / 2;
const DIAMOND = `${MX},0 ${DECISION_W},${MY} ${MX},${DECISION_H} 0,${MY}`;

const COLOR_MAP: Record<string, { fill: string; stroke: string; text: string }> = {
  approved: { fill: '#f0fdf4', stroke: '#86efac', text: '#15803d' },
  pass:     { fill: '#f0fdf4', stroke: '#86efac', text: '#15803d' },
  complete: { fill: '#f0fdf4', stroke: '#86efac', text: '#15803d' },
  success:  { fill: '#f0fdf4', stroke: '#86efac', text: '#15803d' },
  reject:   { fill: '#fef2f2', stroke: '#fca5a5', text: '#dc2626' },
  rejected: { fill: '#fef2f2', stroke: '#fca5a5', text: '#dc2626' },
  fail:     { fill: '#fef2f2', stroke: '#fca5a5', text: '#dc2626' },
  decline:  { fill: '#fef2f2', stroke: '#fca5a5', text: '#dc2626' },
  escalate: { fill: '#fff7ed', stroke: '#fdba74', text: '#ea580c' },
  pending:  { fill: '#fffbeb', stroke: '#fde68a', text: '#92400e' },
};

const DEFAULT_COLORS = { fill: '#eff6ff', stroke: '#93c5fd', text: '#1d4ed8' };
const NO_NEXT_COLORS = { fill: '#f8fafc', stroke: '#cbd5e1', text: '#94a3b8' };
const BACK_EDGE_COLORS = { fill: '#f5f3ff', stroke: '#a78bfa', text: '#7c3aed' };

function pickColors(name: string, hasNoNextStep: boolean, isBackEdge: boolean) {
  if (hasNoNextStep) return NO_NEXT_COLORS;
  if (isBackEdge) return BACK_EDGE_COLORS;
  const lower = name.toLowerCase();
  for (const [key, colors] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return colors;
  }
  return DEFAULT_COLORS;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function ViewDecisionNode({ data, selected }: NodeProps) {
  const { outcome, hasNoNextStep, isBackEdge } = data as unknown as ViewOutcomeData;
  const colors = pickColors(outcome.name, hasNoNextStep, isBackEdge);
  const hasBadge = outcome.applyFilter || hasNoNextStep || isBackEdge;

  return (
    <div style={{ width: DECISION_W, height: DECISION_H, position: 'relative' }}>
      <Handle type="target" position={Position.Left} id="left" style={handleStyle(colors.text)} />

      <svg
        width={DECISION_W}
        height={DECISION_H}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      >
        <polygon
          points={DIAMOND}
          fill={colors.fill}
          stroke={selected ? colors.text : colors.stroke}
          strokeWidth={selected ? 2.5 : 1.5}
          strokeDasharray={hasNoNextStep ? '4 2' : undefined}
          opacity={hasNoNextStep ? 0.75 : 1}
        />

        {/* Name — shift up slightly when a badge row follows */}
        <text
          x={MX}
          y={hasBadge ? MY - 7 : MY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={600}
          fill={colors.text}
          fontFamily="inherit"
        >
          {truncate(outcome.name || 'Decision', 13)}
        </text>

        {hasBadge && (
          <text
            x={MX}
            y={MY + 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill={colors.text}
            fontFamily="inherit"
            opacity={0.7}
          >
            {[
              isBackEdge ? '↩ loop back' : '',
              outcome.applyFilter ? '◈ filter' : '',
              hasNoNextStep ? '⊘ end' : '',
            ].filter(Boolean).join('  ')}
          </text>
        )}
      </svg>

      <Handle type="source" position={Position.Right} id="right" style={handleStyle(colors.text)} />
    </div>
  );
}

function handleStyle(color: string): React.CSSProperties {
  return {
    background: color,
    width: 10,
    height: 10,
    border: '2px solid #fff',
    borderRadius: '50%',
  };
}
