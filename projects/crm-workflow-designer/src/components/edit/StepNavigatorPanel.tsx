import React from 'react';
import { useWorkflowStore } from '@/store/workflowStore';

/** Right-hand navigator listing every workflow step; shown when nothing is selected. */
export function StepNavigatorPanel() {
  const { steps, stepOrder, selectNode } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    selectNode: s.selectNode,
  }));

  return (
    <div style={navPanelStyle}>
      <div style={navHeaderStyle}>
        Steps
        <span style={navCountStyle}>{stepOrder.length}</span>
      </div>
      <div style={navBodyStyle}>
        {stepOrder.length === 0 ? (
          <div style={navEmptyStyle}>No steps yet. Click "Add Step" to begin.</div>
        ) : (
          stepOrder.map((stepId, idx) => {
            const step = steps[stepId];
            if (!step) return null;
            const assignDisplay =
              step.assignTo === 'user'
                ? step.assignedUserName ?? 'Unassigned'
                : step.assignTo === 'team'
                ? step.teamName ?? 'No team'
                : step.roundRobinTeamName ?? 'No team';
            return (
              <button
                key={stepId}
                type="button"
                style={navRowStyle}
                onClick={() => selectNode(`step_${stepId}`)}
              >
                <span style={navSeqStyle}>{idx + 1}</span>
                <div style={navInfoStyle}>
                  <span style={navStepNameStyle}>{step.name || 'Unnamed Step'}</span>
                  <span style={navAssignStyle}>{assignDisplay}</span>
                </div>
              </button>
            );
          })
        )}
        <div style={navHintStyle}>
          Click a step to edit · Drag handles to connect
        </div>
      </div>
    </div>
  );
}

const navPanelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  background: 'var(--bg)',
  borderLeft: '1px solid var(--border-strong)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const navHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-disabled)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border-strong)',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const navCountStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  borderRadius: 8,
  padding: '0 5px',
  fontWeight: 700,
};

const navBodyStyle: React.CSSProperties = {
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  overflowY: 'auto',
  flex: 1,
};

const navEmptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
  padding: '8px 4px',
};

const navRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '7px 8px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const navSeqStyle: React.CSSProperties = {
  minWidth: 20,
  height: 20,
  borderRadius: 4,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const navInfoStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const navStepNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const navAssignStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const navHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text)',
  marginTop: 8,
  textAlign: 'center',
  fontStyle: 'italic',
};
