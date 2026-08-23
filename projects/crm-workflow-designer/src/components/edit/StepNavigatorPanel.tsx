import React from 'react';
import { stepAccent } from '@/styles/stepAccents';
import { useWorkflowStore } from '@/store/workflowStore';

/** Right-hand navigator listing every workflow step; shown when nothing is selected. */
export function StepNavigatorPanel() {
  const { steps, stepOrder, selectNode } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    selectNode: s.selectNode,
  }));

  return (
    <div className="panel">
      <div className="panel-head">
        Steps
        <span className="pill draft">{stepOrder.length}</span>
      </div>
      <div className="panel-body" style={{ gap: 6 }}>
        {stepOrder.length === 0 ? (
          <div className="empty-state">No steps yet. Click "Add Step" to begin.</div>
        ) : (
          stepOrder.map((stepId) => {
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
                <span style={{ ...navSeqStyle, color: stepAccent(stepId), border: `1px solid ${stepAccent(stepId)}` }}>{step.sequenceNo}</span>
                <div style={navInfoStyle}>
                  <span style={navStepNameStyle}>{step.name || 'Unnamed Step'}</span>
                  <span style={navAssignStyle}>{assignDisplay}</span>
                </div>
              </button>
            );
          })
        )}
        <div className="hint-inline">
          Click a step to edit · Drag handles to connect
        </div>
      </div>
    </div>
  );
}

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

