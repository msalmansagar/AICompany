import { useEffect, useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type { AssignToType, TeamOption, UserOption, WorkflowOutcome } from '@/types/WorkflowTypes';
import { SearchableDropdown } from '@/components/common/SearchableDropdown';
import { confirm } from '@/components/ui/ConfirmDialog';
import { SlaEscalationSection } from './SlaEscalationSection';

interface StepPropertiesPanelProps {
  stepId: string | null;
  adapter: ICrmAdapter;
}

type AssigneeOption = { id: string; name: string };

export function StepPropertiesPanel({ stepId, adapter }: StepPropertiesPanelProps) {
  const {
    steps,
    stepOrder,
    outcomes,
    outcomeOrder,
    setStep,
    addOutcome,
    deleteStep,
    moveStepUp,
    moveStepDown,
    selectNode,
    clearSelection,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    outcomes: s.outcomes,
    outcomeOrder: s.outcomeOrder,
    setStep: s.setStep,
    addOutcome: s.addOutcome,
    deleteStep: s.deleteStep,
    moveStepUp: s.moveStepUp,
    moveStepDown: s.moveStepDown,
    selectNode: s.selectNode,
    clearSelection: s.clearSelection,
  }));

  const step = stepId ? steps[stepId] : null;
  const stepIndex = stepId ? stepOrder.indexOf(stepId) : -1;
  const canMoveUp = stepIndex > 0;
  const canMoveDown = stepIndex >= 0 && stepIndex < stepOrder.length - 1;

  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [addingDecision, setAddingDecision] = useState(false);
  const [newDecisionName, setNewDecisionName] = useState('');
  const [newDecisionTarget, setNewDecisionTarget] = useState<string>('__end__');

  const loadAssignees = useCallback(
    async (assignTo: AssignToType) => {
      setIsLoadingAssignees(true);
      try {
        if (assignTo === 'user') {
          const users: UserOption[] = await adapter.getUsers();
          setAssigneeOptions(users.map((u) => ({ id: u.id, name: u.fullName })));
        } else if (assignTo === 'team') {
          const teams: TeamOption[] = await adapter.getTeams();
          setAssigneeOptions(teams);
        } else {
          const rrTeams: TeamOption[] = await adapter.getRoundRobinTeams();
          setAssigneeOptions(rrTeams);
        }
      } catch {
        setAssigneeOptions([]);
      } finally {
        setIsLoadingAssignees(false);
      }
    },
    [adapter]
  );

  const assignTo = step?.assignTo;
  useEffect(() => {
    if (!assignTo) return;
    void loadAssignees(assignTo);
  }, [assignTo, loadAssignees]);

  if (!step) {
    return (
      <div style={panelStyle}>
        <div style={emptyStyle}>No step selected</div>
      </div>
    );
  }

  const currentAssigneeId =
    step.assignTo === 'user'
      ? step.assignedUserId
      : step.assignTo === 'team'
      ? step.teamId
      : step.roundRobinTeamId;

  const handleAssignToChange = (at: AssignToType) => {
    setStep({
      ...step,
      assignTo: at,
      assignedUserId: null,
      assignedUserName: null,
      teamId: null,
      teamName: null,
      roundRobinTeamId: null,
      roundRobinTeamName: null,
    });
  };

  const handleAssigneeChange = (id: string, name: string) => {
    if (step.assignTo === 'user') {
      setStep({ ...step, assignedUserId: id, assignedUserName: name });
    } else if (step.assignTo === 'team') {
      setStep({ ...step, teamId: id, teamName: name });
    } else {
      setStep({ ...step, roundRobinTeamId: id, roundRobinTeamName: name });
    }
  };

  const stepOutcomeIds = outcomeOrder[step.crmId] ?? [];
  const stepOutcomes: WorkflowOutcome[] = stepOutcomeIds
    .map((id) => outcomes[id])
    .filter((o): o is WorkflowOutcome => o !== undefined);

  const otherSteps = stepOrder
    .filter((id) => id !== step.crmId)
    .map((id) => steps[id])
    .filter(Boolean);

  const handleAddDecision = () => {
    const maxSeq = Object.values(outcomes).reduce((m, o) => Math.max(m, o.sequenceNumber), 0);
    const outcomeId = `tmp_${crypto.randomUUID()}`;
    addOutcome({
      crmId: outcomeId,
      name: newDecisionName.trim() || 'Outcome',
      sequenceNumber: maxSeq + 1,
      applyFilter: false,
      stepId: step.crmId,
      nextStepId: newDecisionTarget === '__end__' ? null : newDecisionTarget,
    });
    selectNode(`outcome_${outcomeId}`);
    setAddingDecision(false);
    setNewDecisionName('');
    setNewDecisionTarget('__end__');
  };

  const handleDeleteStep = () => {
    void confirm({
      title: 'Delete step',
      message: 'Delete this step? All connected decisions will also be deleted.',
      tone: 'danger',
    }).then((confirmed) => {
      if (!confirmed) return;
      deleteStep(step.crmId);
      clearSelection();
    });
  };

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>Step Properties</div>
      <div style={panelBodyStyle}>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={step.name}
            onChange={(e) => setStep({ ...step, name: e.target.value })}
            style={inputStyle}
            placeholder="Step name"
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Order</label>
          <div style={orderRowStyle}>
            <span style={seqChipStyle}>#{stepIndex + 1}</span>
            <button
              type="button"
              style={buildMoveBtn(canMoveUp)}
              disabled={!canMoveUp}
              onClick={() => moveStepUp(step.crmId)}
              title="Move earlier in the workflow"
            >
              ↑ Up
            </button>
            <button
              type="button"
              style={buildMoveBtn(canMoveDown)}
              disabled={!canMoveDown}
              onClick={() => moveStepDown(step.crmId)}
              title="Move later in the workflow"
            >
              ↓ Down
            </button>
          </div>
        </div>

        <div style={dividerStyle} />

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Assign To</label>
          <div style={toggleGroupStyle}>
            {ASSIGN_TO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                style={{
                  ...toggleBtnStyle,
                  ...(step.assignTo === opt.value ? toggleBtnActiveStyle : {}),
                }}
                onClick={() => handleAssignToChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {isLoadingAssignees ? (
          <div style={spinnerRowStyle}>
            <span style={spinnerStyle} />
            Loading…
          </div>
        ) : (
          <SearchableDropdown
            label="Assignee"
            placeholder="Search…"
            options={assigneeOptions}
            value={currentAssigneeId}
            onChange={handleAssigneeChange}
          />
        )}

        <div style={dividerStyle} />

        <div style={sectionLabelStyle}>
          Decisions
          <span style={countBadgeStyle}>{stepOutcomes.length}</span>
        </div>

        {stepOutcomes.map((o) => {
          const target = o.nextStepId ? steps[o.nextStepId] : null;
          return (
            <button
              key={o.crmId}
              type="button"
              style={decisionRowStyle}
              onClick={() => selectNode(`outcome_${o.crmId}`)}
              title="Click to edit"
            >
              <div style={decisionInfoStyle}>
                <span style={decisionNameStyle}>{o.name || '(unnamed)'}</span>
                <span style={decisionTargetStyle}>
                  → {target ? `${target.sequenceNo}. ${target.name}` : 'End'}
                </span>
              </div>
              {o.applyFilter && (
                <span style={conditionalBadgeStyle}>◈ Decision</span>
              )}
              <span style={arrowStyle}>›</span>
            </button>
          );
        })}

        {addingDecision ? (
          <div style={addFormStyle}>
            <input
              type="text"
              value={newDecisionName}
              onChange={(e) => setNewDecisionName(e.target.value)}
              placeholder="Decision name (optional)"
              style={inputStyle}
              autoFocus
            />
            <label style={labelStyle}>Goes to</label>
            <select
              value={newDecisionTarget}
              onChange={(e) => setNewDecisionTarget(e.target.value)}
              style={selectStyle}
            >
              <option value="__end__">— End —</option>
              {otherSteps.map((s) => (
                <option key={s!.crmId} value={s!.crmId}>
                  {s!.sequenceNo}. {s!.name}
                </option>
              ))}
            </select>
            <div style={addFormActionsStyle}>
              <button type="button" style={addConfirmBtnStyle} onClick={handleAddDecision}>
                Add
              </button>
              <button
                type="button"
                style={cancelBtnStyle}
                onClick={() => setAddingDecision(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            style={addDecisionBtnStyle}
            onClick={() => setAddingDecision(true)}
          >
            + Add Decision
          </button>
        )}

        <div style={dividerStyle} />

        <SlaEscalationSection
          value={step}
          onChange={(patch) => setStep({ ...step, ...patch })}
          adapter={adapter}
        />

        <div style={dividerStyle} />

        <button type="button" style={deleteBtnStyle} onClick={handleDeleteStep}>
          Delete Step
        </button>
      </div>
    </div>
  );
}

const ASSIGN_TO_OPTIONS: Array<{ value: AssignToType; label: string }> = [
  { value: 'user', label: 'User' },
  { value: 'team', label: 'Team' },
  { value: 'roundRobin', label: 'Round Robin' },
];

const panelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  background: '#0f172a',
  borderLeft: '1px solid #1e293b',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #1e293b',
  flexShrink: 0,
};

const panelBodyStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  overflowY: 'auto',
  flex: 1,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  height: 30,
  padding: '0 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  height: 30,
  padding: '0 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const toggleGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
};

const toggleBtnStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  fontSize: 11,
  fontWeight: 500,
  border: '1px solid #334155',
  borderRadius: 4,
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};

const toggleBtnActiveStyle: React.CSSProperties = {
  background: '#1d4ed8',
  borderColor: '#3b82f6',
  color: '#fff',
};

const spinnerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#64748b',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  border: '2px solid #334155',
  borderTopColor: '#2563eb',
  borderRadius: '50%',
};

const orderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const seqChipStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  background: '#334155',
  borderRadius: 4,
  padding: '3px 8px',
  flexShrink: 0,
};

function buildMoveBtn(enabled: boolean): React.CSSProperties {
  return {
    height: 26,
    padding: '0 8px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 4,
    border: '1px solid #334155',
    background: 'transparent',
    color: enabled ? '#e2e8f0' : '#475569',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
  };
}

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #1e293b',
  margin: '2px 0',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#334155',
  color: '#94a3b8',
  borderRadius: 8,
  padding: '0 5px',
  fontWeight: 700,
};

const decisionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 5,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const decisionInfoStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const decisionNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#e2e8f0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const decisionTargetStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
};

const conditionalBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#fbbf24',
  background: '#451a03',
  border: '1px solid #92400e',
  borderRadius: 3,
  padding: '1px 5px',
  flexShrink: 0,
};

const arrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#475569',
  flexShrink: 0,
};

const addFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
};

const addFormActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
};

const addConfirmBtnStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: 'none',
  background: '#1d4ed8',
  color: '#fff',
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 4,
  border: '1px solid #334155',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};

const addDecisionBtnStyle: React.CSSProperties = {
  height: 28,
  width: '100%',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px dashed #334155',
  background: 'transparent',
  color: '#64748b',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const deleteBtnStyle: React.CSSProperties = {
  height: 30,
  width: '100%',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px solid #7f1d1d',
  background: 'transparent',
  color: '#ef4444',
  cursor: 'pointer',
  marginTop: 4,
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: '#475569',
  fontStyle: 'italic',
};
