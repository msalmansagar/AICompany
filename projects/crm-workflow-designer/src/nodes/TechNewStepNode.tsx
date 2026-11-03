import { Handle, Position } from '@xyflow/react';
import { AssignIcon, assignTypeFromLabel } from './assignIcons';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import type { TechNewStepData } from '../services/TechNewGraphBuilder';
import type { StepOutcomeRow } from '../services/WorkflowGraphBuilder';
import { NODE_NEUTRAL_CHIP } from '@/styles/surfacePairs';

const ASSIGN_COLOR: Record<string, { bg: string; text: string }> = {
  'Specific User': { bg: 'var(--primary-tint-2)', text: 'var(--primary-pressed)' },
  'Team':          { bg: 'var(--success-bg)', text: 'var(--success)' },
  'Round Robin':   { bg: 'var(--accent-branch-bg)', text: 'var(--accent-branch)' },
};

export function TechNewStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows, layoutDir } = data as unknown as TechNewStepData;
  const isLR = layoutDir === 'LR';
  const assignLabel = getAssignToLabel(step.assignToCode);
  const assignColor = ASSIGN_COLOR[assignLabel] ?? { bg: 'var(--surface-alt)', text: 'var(--text-secondary)' };
  const assigneeName =
    assignLabel === 'Specific User' ? step.assignedUserName
    : assignLabel === 'Team'        ? step.teamName
    :                                 step.roundRobinTeamName;

  const techId = step.schemaName || `…${step.id.slice(-8)}`;
  const inPos  = isLR ? Position.Left   : Position.Top;
  const outPos = isLR ? Position.Bottom : Position.Right;

  return (
    <div style={containerStyle(selected ?? false)}>
      <Handle type="target" position={inPos} id="in" style={handleStyle('var(--text-disabled)')} />

      <div style={techHeader}>
        <span style={techBadge}>TECH</span>
        <span style={seqBadge}>{step.sequenceNo}</span>
        <span style={nameText}>{step.name || 'Unnamed Step'}</span>
      </div>

      <div style={schemaRow}>{techId}</div>

      <div style={chipsRow}>
        <span
          style={{ ...chip(assignColor.bg, assignColor.text), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 18, padding: 0 }}
          title={assignLabel}
          aria-label={assignLabel}
          role="img"
        >
          <AssignIcon type={assignTypeFromLabel(assignLabel)} />
        </span>
        {assigneeName && (
          <span style={chip(NODE_NEUTRAL_CHIP.background, NODE_NEUTRAL_CHIP.foreground)} title={assigneeName}>{assigneeName}</span>
        )}
      </div>

      {step.taskSubject && (
        <div style={taskRow}>
          <span style={taskLabel}>Subject:</span>
          <span style={taskValue}>{step.taskSubject}</span>
        </div>
      )}

      {step.recordEntityName && (
        <div style={entityRow}>
          <span style={entityBadge}>{step.recordEntityName}</span>
          {step.regardingFieldName && (
            <span style={entityField}>→ {step.regardingFieldName}</span>
          )}
        </div>
      )}

      {outcomeRows.length > 0 && (
        <>
          <div style={divider} />
          <div style={outcomesSection}>
            {outcomeRows.map((row) => (
              <TechNewOutcomeRow key={row.id} row={row} />
            ))}
          </div>
        </>
      )}

      <Handle type="source" position={outPos} id="out" style={handleStyle('var(--text-secondary)')} />
    </div>
  );
}

function TechNewOutcomeRow({ row }: { row: StepOutcomeRow }) {
  if (row.isBackEdge) {
    return (
      <div style={backEdgeRow}>
        <span style={icon('var(--accent-branch)')}>↩</span>
        <span style={outcomeLabel('var(--accent-branch)')}>{row.name}</span>
        <div style={rightSide}>
          {row.applyFilter && <span style={filterBadge}>◈</span>}
          {row.nextStepName && <span style={backTargetText}>↑ {row.nextStepName}</span>}
        </div>
      </div>
    );
  }
  if (row.isTerminal) {
    return (
      <div style={outcomeRow}>
        <span style={icon('var(--error)')}>⊘</span>
        <span style={outcomeLabel('var(--error)')}>{row.name}</span>
        <span style={targetText('var(--error)')}>END</span>
      </div>
    );
  }
  return (
    <div style={outcomeRow}>
      <span style={icon('var(--success)')}>→</span>
      <span style={outcomeLabel('var(--text)')}>{row.name}</span>
      <div style={rightSide}>
        {row.applyFilter && <span style={filterBadge}>◈</span>}
        {row.nextStepName && <span style={targetText('var(--text-secondary)')}>{row.nextStepName}</span>}
      </div>
    </div>
  );
}

function handleStyle(color: string): React.CSSProperties {
  return { background: color, width: 10, height: 10, border: '2px solid var(--border)', borderRadius: '50%' };
}

function containerStyle(selected: boolean): React.CSSProperties {
  return {
    background: 'var(--surface)',
    border: selected ? '2px solid var(--primary)' : '1.5px solid var(--border-strong)',
    borderRadius: 8,
    width: 280,
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,0.15), 0 4px 12px rgba(0,0,0,0.1)'
      : '0 2px 8px rgba(0,0,0,0.08)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    boxSizing: 'border-box',
    overflow: 'hidden',
  };
}

function chip(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block', fontSize: 10, fontWeight: 500, background: bg, color,
    border: `1px solid ${NODE_NEUTRAL_CHIP.border}`, borderRadius: 4, padding: '1px 6px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130,
  };
}

function icon(color: string): React.CSSProperties {
  return { fontSize: 11, color, fontWeight: 700, flexShrink: 0, width: 14, textAlign: 'center' };
}

function outcomeLabel(color: string): React.CSSProperties {
  return { fontSize: 11, color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

function targetText(color: string): React.CSSProperties {
  return {
    fontSize: 10, color, opacity: 0.8, flexShrink: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100,
  };
}

const techHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'var(--surface)', padding: '7px 12px',
};

const techBadge: React.CSSProperties = {
  fontSize: 8, fontWeight: 800, color: 'var(--text-disabled)', letterSpacing: '0.1em', flexShrink: 0,
};

const seqBadge: React.CSSProperties = {
  background: 'var(--surface-alt)', color: 'var(--text)', borderRadius: 4,
  fontSize: 10, fontWeight: 700, padding: '1px 6px', flexShrink: 0, lineHeight: '16px',
};

const nameText: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};

const schemaRow: React.CSSProperties = {
  fontSize: 10, fontFamily: 'monospace', color: 'var(--text-secondary)', background: 'var(--surface-alt)',
  padding: '3px 12px', borderBottom: '1px solid var(--border)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const chipsRow: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 4, padding: '7px 12px 4px',
};

const taskRow: React.CSSProperties = {
  display: 'flex', gap: 4, alignItems: 'baseline', padding: '0 12px 3px',
};

const taskLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, color: 'var(--text-disabled)', textTransform: 'uppercase', flexShrink: 0,
};

const taskValue: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const entityRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px 4px',
};

const entityBadge: React.CSSProperties = {
  fontSize: 10, background: 'var(--surface-alt)', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px',
};

const entityField: React.CSSProperties = { fontSize: 10, color: 'var(--text-disabled)' };

const divider: React.CSSProperties = { borderTop: '1px solid var(--border)', margin: '4px 12px 4px' };

const outcomesSection: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, padding: '0 12px 8px',
};

const outcomeRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, minHeight: 20,
};

const backEdgeRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, minHeight: 20,
  background: 'var(--accent-branch-bg)', borderLeft: '3px solid var(--accent-branch)',
  margin: '1px -12px', padding: '2px 12px 2px 9px',
};

const backTargetText: React.CSSProperties = {
  fontSize: 10, color: 'var(--accent-branch)', fontWeight: 600, flexShrink: 0,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100,
};

const rightSide: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
};

const filterBadge: React.CSSProperties = { fontSize: 9, color: 'var(--warning)', fontWeight: 700 };
