import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowOutcome } from '@/types/WorkflowTypes';

interface SimulationPanelProps {
  onExit: () => void;
}

export function SimulationPanel({ onExit }: SimulationPanelProps) {
  const {
    steps,
    outcomes,
    outcomeOrder,
    simCurrentStepId,
    simHistory,
    simTakeOutcome,
    simStepBack,
    startSimulation,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    outcomes: s.outcomes,
    outcomeOrder: s.outcomeOrder,
    simCurrentStepId: s.simCurrentStepId,
    simHistory: s.simHistory,
    simTakeOutcome: s.simTakeOutcome,
    simStepBack: s.simStepBack,
    startSimulation: s.startSimulation,
  }));

  const currentStep = simCurrentStepId ? steps[simCurrentStepId] : null;
  const isComplete = simCurrentStepId === null && simHistory.length > 0;
  const canStepBack = simHistory.length > 0;

  const availableOutcomes = simCurrentStepId
    ? (outcomeOrder[simCurrentStepId] ?? [])
        .map((id) => outcomes[id])
        .filter((o): o is WorkflowOutcome => o !== undefined)
    : [];

  const pathLabel = buildPathLabel(simHistory, steps);

  return (
    <div style={panelStyle}>
      <div style={topRowStyle}>
        <span style={simBadgeStyle}>⏵ SIMULATION</span>

        {isComplete ? (
          <span style={completeLabelStyle}>✓ Process Complete</span>
        ) : (
          <span style={stepTitleStyle} title={currentStep?.name}>
            {currentStep?.name ?? '—'}
          </span>
        )}

        {currentStep && (
          <span style={assigneeChipStyle}>{resolveAssigneeLabel(currentStep)}</span>
        )}

        <div style={flexSpacer} />

        {pathLabel && <span style={pathLabelStyle}>{pathLabel}</span>}

        <button type="button" onClick={onExit} style={exitBtnStyle} title="Exit simulation">
          Exit ✕
        </button>
      </div>

      <div style={actionRowStyle}>
        <NavButton label="← Back" onClick={simStepBack} disabled={!canStepBack} />
        <NavButton label="↺ Reset" onClick={startSimulation} disabled={false} />

        <div style={actionDividerStyle} />

        {isComplete && (
          <span style={completeNoteStyle}>No more steps in this path.</span>
        )}

        {!isComplete && availableOutcomes.length === 0 && !isComplete && (
          <span style={completeNoteStyle}>This step has no outgoing outcomes. Add outcomes to continue.</span>
        )}

        {availableOutcomes.map((outcome) => (
          <OutcomeButton key={outcome.crmId} outcome={outcome} onTake={simTakeOutcome} />
        ))}
      </div>
    </div>
  );
}

function OutcomeButton({
  outcome,
  onTake,
}: {
  outcome: WorkflowOutcome;
  onTake: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTake(outcome.crmId)}
      style={outcomeBtnStyle}
      title={`Take outcome: ${outcome.name}`}
    >
      {outcome.name} ▶
    </button>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...navBtnStyle, ...(disabled ? navBtnDisabledStyle : {}) }}
    >
      {label}
    </button>
  );
}

function buildPathLabel(
  history: Array<{ stepId: string }>,
  steps: ReturnType<typeof useWorkflowStore.getState>['steps']
): string {
  if (history.length === 0) return '';
  const names = history.map((h) => steps[h.stepId]?.name ?? '?');
  return `Start → ${names.join(' → ')}`;
}

function resolveAssigneeLabel(
  step: ReturnType<typeof useWorkflowStore.getState>['steps'][string]
): string {
  if (!step) return '';
  const name =
    step.assignTo === 'user'
      ? step.assignedUserName
      : step.assignTo === 'team'
        ? step.teamName
        : step.roundRobinTeamName;
  const label = step.assignTo === 'roundRobin' ? 'Round Robin' : step.assignTo === 'team' ? 'Team' : 'User';
  return name ? `${label}: ${name}` : label;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  background: '#0f172a',
  borderTop: '1px solid #1e3a5f',
  zIndex: 50,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 16px 4px',
  borderBottom: '1px solid #1e293b',
  minHeight: 36,
  flexWrap: 'wrap',
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px 10px',
  flexWrap: 'wrap',
};

const simBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: '#60a5fa',
  background: 'rgba(37,99,235,0.18)',
  border: '1px solid rgba(37,99,235,0.35)',
  borderRadius: 4,
  padding: '2px 8px',
  flexShrink: 0,
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#f1f5f9',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 240,
};

const completeLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#4ade80',
};

const assigneeChipStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '2px 8px',
  flexShrink: 0,
};

const flexSpacer: React.CSSProperties = { flex: 1, minWidth: 0 };

const pathLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#475569',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 320,
};

const exitBtnStyle: React.CSSProperties = {
  height: 26,
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#94a3b8',
  cursor: 'pointer',
  flexShrink: 0,
};

const navBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 4,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#cbd5e1',
  cursor: 'pointer',
  flexShrink: 0,
};

const navBtnDisabledStyle: React.CSSProperties = {
  opacity: 0.38,
  cursor: 'not-allowed',
};

const actionDividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#334155',
  flexShrink: 0,
};

const outcomeBtnStyle: React.CSSProperties = {
  height: 30,
  padding: '0 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 4,
  border: '1.5px solid #2563eb',
  background: 'rgba(37,99,235,0.12)',
  color: '#93c5fd',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.1s, border-color 0.1s',
};

const completeNoteStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#64748b',
  fontStyle: 'italic',
};
