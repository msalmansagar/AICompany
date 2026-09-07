import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { OverviewStageData } from '@/services/stageOverview';
import { OVERVIEW_STAGE_W, OVERVIEW_STAGE_H } from '@/services/stageOverview';
import { stepAccent } from '@/styles/stepAccents';

/**
 * One stage of the journey on the Overview canvas (CWFD-017 PR5): the stage
 * name, how much it holds, and how much of it loops back — a table of
 * contents entry, not a diagram. Clicking drills into the Detailed canvas
 * at this stage's first step (the canvas wires that).
 */
export function OverviewStageNode({ data, selected }: NodeProps) {
  const { stage, layoutDir, stepNames } = data as unknown as OverviewStageData;
  const isTB = layoutDir === 'TB';
  const accent = stepAccent(stage.firstStepId);
  const title = [
    `${stage.label} — ${stage.counts.steps} step${stage.counts.steps === 1 ? '' : 's'}.`,
    stepNames.filter(Boolean).join(' · '),
    'Click to open this stage in the Detailed view.',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div style={cardStyle(selected ?? false, accent)} title={title}>
      <Handle type="target" position={isTB ? Position.Top : Position.Left} id="in" style={handleStyle} />
      <Handle type="target" position={isTB ? Position.Left : Position.Top} id="side-in" style={handleStyle} />
      <Handle type="source" position={isTB ? Position.Right : Position.Bottom} id="side-out" style={handleStyle} />

      <div style={labelRow}>
        <span style={indexBadge}>{stage.index + 1}</span>
        <span style={labelText}>{stage.label}</span>
      </div>

      <div style={countsRow}>
        <span style={countChip('var(--text-secondary)')}>
          {stage.counts.steps} {stage.counts.steps === 1 ? 'step' : 'steps'}
        </span>
        {stage.counts.returns > 0 && (
          <span style={countChip('var(--accent-branch)')} title={`${stage.counts.returns} return paths leave this stage`}>
            ↩ {stage.counts.returns}
          </span>
        )}
        {stage.counts.parallel > 0 && (
          <span style={countChip('var(--primary)')} title={`${stage.counts.parallel} steps run at the same time as another`}>
            ∥ {stage.counts.parallel}
          </span>
        )}
        {stage.counts.endings > 0 && (
          <span style={countChip('var(--error)')} title={`${stage.counts.endings} decisions here can end the process`}>
            ⊘ {stage.counts.endings}
          </span>
        )}
      </div>

      <Handle type="source" position={isTB ? Position.Bottom : Position.Right} id="out" style={handleStyle} />
    </div>
  );
}

function cardStyle(isSelected: boolean, accent: string): React.CSSProperties {
  return {
    width: OVERVIEW_STAGE_W,
    minHeight: OVERVIEW_STAGE_H,
    background: 'var(--surface)',
    border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--border-strong)',
    borderLeft: `5px solid ${accent}`,
    borderRadius: 12,
    padding: '14px 18px',
    boxShadow: isSelected
      ? '0 0 0 3px rgba(37,99,235,0.15), 0 4px 12px rgba(0,0,0,0.1)'
      : '0 2px 8px rgba(0,0,0,0.08)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

const labelRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

const indexBadge: React.CSSProperties = {
  background: 'var(--primary)',
  color: 'var(--text-on-primary)',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  padding: '2px 9px',
  flexShrink: 0,
};

const labelText: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const countsRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };

function countChip(color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    color,
    background: 'var(--surface-alt)',
    border: `1px solid ${color}`,
    borderRadius: 4,
    padding: '1px 8px',
  };
}

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  border: '2px solid var(--border)',
  background: 'var(--text-disabled)',
  borderRadius: '50%',
};
