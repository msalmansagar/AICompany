import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { getAssignToLabel } from '../types/ViewTypes';
import type { TechStepData, BackHandleInfo } from '../services/TechnicalGraphBuilder';
import type { StepOutcomeRow } from '../services/WorkflowGraphBuilder';

const ASSIGN_COLOR: Record<string, { bg: string; text: string }> = {
  'Specific User': { bg: '#eff6ff', text: '#1d4ed8' },
  'Team':          { bg: '#f0fdf4', text: '#15803d' },
  'Round Robin':   { bg: '#faf5ff', text: '#7e22ce' },
};

export function TechStepNode({ data, selected }: NodeProps) {
  const { step, outcomeRows, layoutDir, backOutHandles, backInHandles } = data as unknown as TechStepData;
  const isLR = layoutDir === 'LR';
  const assignLabel = getAssignToLabel(step.assignToCode);
  const assignColor = ASSIGN_COLOR[assignLabel] ?? { bg: '#f1f5f9', text: '#475569' };
  const assigneeName =
    assignLabel === 'Specific User' ? step.assignedUserName
    : assignLabel === 'Team'        ? step.teamName
    :                                 step.roundRobinTeamName;

  const techId = step.schemaName || `…${step.id.slice(-8)}`;
  const mainInPos  = isLR ? Position.Left  : Position.Top;
  const mainOutPos = isLR ? Position.Right : Position.Bottom;
  const backHandlePos = isLR ? Position.Top : Position.Left;

  return (
    <div style={containerStyle(selected ?? false)}>
      <Handle type="target" position={mainInPos} id="in" style={handle('#94a3b8')} />

      {(backOutHandles ?? []).map((h: BackHandleInfo) => (
        <Handle
          key={`bo-${h.outcomeId}`}
          type="source"
          position={backHandlePos}
          id={`back-out-${h.outcomeId}`}
          style={backHandleStyle(isLR, h.offset)}
        />
      ))}
      {(backInHandles ?? []).map((h: BackHandleInfo) => (
        <Handle
          key={`bi-${h.outcomeId}`}
          type="target"
          position={backHandlePos}
          id={`back-in-${h.outcomeId}`}
          style={backHandleStyle(isLR, h.offset)}
        />
      ))}

      {/* Technical header band */}
      <div style={techHeader}>
        <span style={techBadge}>TECH</span>
        <span style={seqBadge}>{step.sequenceNo}</span>
        <span style={nameText}>{step.name || 'Unnamed Step'}</span>
      </div>

      {/* Always-visible schema / ID row */}
      <div style={schemaRow}>{techId}</div>

      {/* Assignee */}
      <div style={chipsRow}>
        <span style={chip(assignColor.bg, assignColor.text)}>{assignLabel}</span>
        {assigneeName && (
          <span style={chip('#f8fafc', '#374151')} title={assigneeName}>{assigneeName}</span>
        )}
      </div>

      {/* Task subject */}
      {step.taskSubject && (
        <div style={taskRow}>
          <span style={taskLabel}>Subject:</span>
          <span style={taskValue}>{step.taskSubject}</span>
        </div>
      )}

      {/* Entity mapping */}
      {step.recordEntityName && (
        <div style={entityRow}>
          <span style={entityBadge}>{step.recordEntityName}</span>
          {step.regardingFieldName && (
            <span style={entityField}>→ {step.regardingFieldName}</span>
          )}
        </div>
      )}

      {/* Outcomes */}
      {outcomeRows.length > 0 && (
        <>
          <div style={divider} />
          <div style={outcomesSection}>
            {outcomeRows.map((row) => (
              <TechOutcomeRow key={row.id} row={row} />
            ))}
          </div>
        </>
      )}

      <Handle type="source" position={mainOutPos} id="out" style={handle('#64748b')} />
    </div>
  );
}

function TechOutcomeRow({ row }: { row: StepOutcomeRow }) {
  if (row.isBackEdge) {
    return (
      <div style={backEdgeRow}>
        <span style={icon('#7c3aed')}>↩</span>
        <span style={outcomeLabel('#4c1d95')}>{row.name}</span>
        <div style={rightSide}>
          {row.applyFilter && <span style={filterBadge}>◈ filtered</span>}
          {row.nextStepName && <span style={backTargetText}>↑ {row.nextStepName}</span>}
        </div>
      </div>
    );
  }
  if (row.isTerminal) {
    return (
      <div style={outcomeRow}>
        <span style={icon('#dc2626')}>⊘</span>
        <span style={outcomeLabel('#7f1d1d')}>{row.name}</span>
        <span style={targetText('#dc2626')}>→ END</span>
      </div>
    );
  }
  return (
    <div style={outcomeRow}>
      <span style={icon('#16a34a')}>→</span>
      <span style={outcomeLabel('#1e293b')}>{row.name}</span>
      <div style={rightSide}>
        {row.applyFilter && <span style={filterBadge}>◈ filtered</span>}
        {row.nextStepName && <span style={targetText('#475569')}>{row.nextStepName}</span>}
      </div>
    </div>
  );
}

function handle(color: string): React.CSSProperties {
  return { background: color, width: 10, height: 10, border: '2px solid #fff', borderRadius: '50%' };
}

function backHandleStyle(isLR: boolean, offset: number): React.CSSProperties {
  return {
    background: '#a78bfa', width: 8, height: 8,
    border: '2px solid #fff', borderRadius: '50%',
    ...(isLR ? { left: `${offset}%` } : { top: `${offset}%` }),
  };
}

function containerStyle(selected: boolean): React.CSSProperties {
  return {
    background: '#fff',
    border: selected ? '2px solid #2563eb' : '1.5px solid #94a3b8',
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
    border: `1px solid ${color}22`, borderRadius: 4, padding: '1px 6px',
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
  background: '#1e293b', padding: '7px 12px',
};

const techBadge: React.CSSProperties = {
  fontSize: 8, fontWeight: 800, color: '#94a3b8',
  letterSpacing: '0.1em', flexShrink: 0,
};

const seqBadge: React.CSSProperties = {
  background: '#334155', color: '#e2e8f0', borderRadius: 4,
  fontSize: 10, fontWeight: 700, padding: '1px 6px', flexShrink: 0, lineHeight: '16px',
};

const nameText: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#f1f5f9',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};

const schemaRow: React.CSSProperties = {
  fontSize: 10, fontFamily: 'monospace', color: '#64748b', background: '#f8fafc',
  padding: '3px 12px', borderBottom: '1px solid #e2e8f0',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const chipsRow: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 4, padding: '7px 12px 4px',
};

const taskRow: React.CSSProperties = {
  display: 'flex', gap: 4, alignItems: 'baseline',
  padding: '0 12px 3px',
};

const taskLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', flexShrink: 0,
};

const taskValue: React.CSSProperties = {
  fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const entityRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px 4px',
};

const entityBadge: React.CSSProperties = {
  fontSize: 10, background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px',
};

const entityField: React.CSSProperties = { fontSize: 10, color: '#94a3b8' };

const divider: React.CSSProperties = {
  borderTop: '1px solid #f1f5f9', margin: '4px 12px 4px',
};

const outcomesSection: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, padding: '0 12px 8px',
};

const outcomeRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, minHeight: 20,
};

const backEdgeRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, minHeight: 20,
  background: '#f5f3ff', borderLeft: '3px solid #7c3aed',
  margin: '1px -12px', padding: '2px 12px 2px 9px',
};

const backTargetText: React.CSSProperties = {
  fontSize: 10, color: '#7c3aed', fontWeight: 600, flexShrink: 0,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100,
};

const rightSide: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
};

const filterBadge: React.CSSProperties = {
  fontSize: 9, color: '#d97706', fontWeight: 700,
};
