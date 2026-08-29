import { emptyWorkflowHooks, OUTCOME_HOOKS, STEP_HOOKS } from '@/services/workflowHooks';
import { stepAccent } from '@/styles/stepAccents';
import { useEffect, useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type { AssignToType, TeamOption, UserOption, WorkflowOutcome } from '@/types/WorkflowTypes';
import { SearchableDropdown } from '@/components/common/SearchableDropdown';
import { confirm } from '@/components/ui/ConfirmDialog';
import { EscalationSection } from './EscalationSection';
import { WorkflowHooksSection } from './WorkflowHooksSection';
import { BranchSection } from './BranchSection';
import { ParentAssignmentSection } from './ParentAssignmentSection';
import { ASSIGN_TO_LABELS, ASSIGN_TO_TYPES, emptyAssignmentFields } from '@/services/taskAssignment';
import { branchChildrenOf, emptyOutcomeConcurrency } from '@/services/branchFields';
import { FetchXmlBuilderDialog } from '@/components/FetchXmlBuilder/FetchXmlBuilderDialog';
import { useFetchXmlEntityContext } from '@/hooks/useFetchXmlEntityContext';

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
    duplicateStep,
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
    duplicateStep: s.duplicateStep,
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
  const [showBranchFilterBuilder, setShowBranchFilterBuilder] = useState(false);
  const fetchXmlContext = useFetchXmlEntityContext(adapter);
  const [addingDecision, setAddingDecision] = useState(false);

  // Which tab of the panel is open. Survives step switches on purpose —

  // comparing the same facet across steps is the common flow.

  const [activeTab, setActiveTab] = useState<PanelTab>('general');
  const [newDecisionName, setNewDecisionName] = useState('');
  const [newDecisionTarget, setNewDecisionTarget] = useState<string>('__end__');

  const loadAssignees = useCallback(
    async (assignTo: AssignToType) => {
      // Read From Parent resolves its owner at runtime, so there is no list to pick from.
      if (assignTo === 'readFromParent') {
        setAssigneeOptions([]);
        return;
      }
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
      <div className="panel">
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
    setStep({ ...step, ...emptyAssignmentFields(), assignTo: at });
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

  // A step cannot run beneath one of its own branches — that would be a cycle.
  const isDescendantOfThisStep = (candidateId: string): boolean => {
    const seen = new Set<string>();
    let current: string | null = candidateId;
    while (current && !seen.has(current)) {
      seen.add(current);
      if (current === step.crmId) return true;
      current = steps[current]?.parentStepId ?? null;
    }
    return false;
  };

  const candidateParents = otherSteps
    .filter((candidate) => !isDescendantOfThisStep(candidate.crmId))
    .map((candidate) => ({ id: candidate.crmId, name: candidate.name, sequenceNo: candidate.sequenceNo }));

  const handleAddDecision = () => {
    const maxSeq = Object.values(outcomes).reduce((m, o) => Math.max(m, o.sequenceNumber), 0);
    const outcomeId = `tmp_${crypto.randomUUID()}`;
    addOutcome({
      crmId: outcomeId,
      name: newDecisionName.trim() || 'Outcome',
      sequenceNumber: maxSeq + 1,
      applyFilter: false,
      ...emptyOutcomeConcurrency(),
      workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
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
    <div className="panel" style={{ borderTop: `3px solid ${stepAccent(step.crmId)}` }}>
      <div style={panelHeaderStyle}>Step Properties</div>
      <div style={tabRowStyle} role="tablist" aria-label="Step property groups">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'pivot-tab active' : 'pivot-tab'}
            style={tabBtnStyle}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={panelBodyStyle}>
        {activeTab === 'general' && (<>

        <div style={fieldGroupStyle}>
          <label className="lbl">Name</label>
          <input
            type="text"
            value={step.name}
            onChange={(e) => setStep({ ...step, name: e.target.value })}
            className="fluent-input"
            placeholder="Step name"
          />
        </div>

        {/* CWFD-016 B1: the Loan process shipped 35 "missing task subject"
            warnings the editor could point at but not fix — the wizard could
            set these fields, the editor could not. */}
        <div style={fieldGroupStyle}>
          <label className="lbl">Task Subject</label>
          <input
            type="text"
            value={step.taskSubject}
            onChange={(e) => setStep({ ...step, taskSubject: e.target.value })}
            className="fluent-input"
            placeholder={step.name || 'What the assignee sees on their task'}
          />
          <span className="hint-inline">The title of the task the engine creates for this step.</span>
        </div>

        <div style={fieldGroupStyle}>
          <label className="lbl">Task Description</label>
          <textarea
            value={step.taskDescription}
            onChange={(e) => setStep({ ...step, taskDescription: e.target.value })}
            className="fluent-input"
            rows={3}
            placeholder="Instructions for whoever works the task"
            style={taskDescriptionStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label className="lbl">Order</label>
          <div style={orderRowStyle}>
            <span style={seqChipStyle}>#{step.sequenceNo}</span>
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

        </>)}

        {activeTab === 'assignment' && (<>

        <div style={fieldGroupStyle}>
          <label className="lbl">Assign To</label>
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

        {step.assignTo === 'readFromParent' ? (
          <ParentAssignmentSection
            value={step}
            onChange={(patch) => setStep({ ...step, ...patch })}
            adapter={adapter}
          />
        ) : isLoadingAssignees ? (
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

        <label style={bulkApprovalRowStyle}>
          <input
            type="checkbox"
            checked={step.allowBulkApproval}
            onChange={(event) => setStep({ ...step, allowBulkApproval: event.target.checked })}
          />
          <span style={bulkApprovalLabelStyle}>Allow bulk approval</span>
        </label>
        <span style={bulkApprovalHintStyle}>
          Completing one task also closes every other task submitted with it, copying this
          task&rsquo;s decision onto each.
        </span>

        </>)}

        {activeTab === 'general' && (<>

        <div className="panel-section">
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
              className="fluent-input"
              autoFocus
            />
            <label className="lbl">Goes to</label>
            <select
              value={newDecisionTarget}
              onChange={(e) => setNewDecisionTarget(e.target.value)}
              className="fluent-select"
            >
              <option value="__end__">— End —</option>
              {otherSteps.map((s) => (
                <option key={s!.crmId} value={s!.crmId}>
                  {s!.sequenceNo}. {s!.name}
                </option>
              ))}
            </select>
            <div style={addFormActionsStyle}>
              <button type="button" className="btn sm primary" style={{ flex: 1 }} onClick={handleAddDecision}>
                Add
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => setAddingDecision(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn sm block"
            onClick={() => setAddingDecision(true)}
          >
            + Add Decision
          </button>
        )}

        <div style={dividerStyle} />

        <BranchSection
          value={step}
          onChange={(patch) => setStep({ ...step, ...patch })}
          candidateParents={candidateParents}
          childCount={branchChildrenOf(step.crmId, steps).length}
          onEditCondition={() => setShowBranchFilterBuilder(true)}
        />

        </>)}

        {activeTab === 'automation' && (
        <WorkflowHooksSection
          value={step.workflowHooks}
          onChange={(workflowHooks) => setStep({ ...step, workflowHooks })}
          kinds={STEP_HOOKS}
          adapter={adapter}
          scopeNote="Runs for every task this step creates. The engine also runs any workflow set on the outcome and on the process, so more than one can fire."
        />
        )}

        {activeTab === 'sla' && (
        <EscalationSection
          value={step}
          onChange={(patch) => setStep({ ...step, ...patch })}
          adapter={adapter}
          />
        )}

        <div style={dividerStyle} />

        <button
          type="button"
          className="btn sm block"
          onClick={() => duplicateStep(step.crmId)}
          title="Clone this step with its assignment, SLA, automation, decisions and routes"
        >
          Duplicate Step
        </button>

        <button type="button" className="btn sm block danger" onClick={handleDeleteStep}>
          Delete Step
        </button>
      </div>

      {showBranchFilterBuilder && (
        <FetchXmlBuilderDialog
          open={showBranchFilterBuilder}
          entityLogicalName={fetchXmlContext.entityLogicalName}
          objectTypeCode={fetchXmlContext.objectTypeCode}
          clientUrl={fetchXmlContext.clientUrl}
          initialFetchXml={step.branchFilter}
          onApply={(xml) => {
            setStep({ ...step, branchFilter: xml });
            setShowBranchFilterBuilder(false);
          }}
          onDismiss={() => setShowBranchFilterBuilder(false)}
        />
      )}
    </div>
  );
}

type PanelTab = 'general' | 'assignment' | 'sla' | 'automation';

const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'sla', label: 'SLA' },
  { id: 'automation', label: 'Automation' },
];

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '0 8px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const tabBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '7px 8px',
};

const ASSIGN_TO_OPTIONS: Array<{ value: AssignToType; label: string }> = ASSIGN_TO_TYPES.map(
  (value) => ({ value, label: ASSIGN_TO_LABELS[value] })
);

const bulkApprovalRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 10,
};
const bulkApprovalLabelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text)' };
const bulkApprovalHintStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4, paddingTop: 2,
};

const taskDescriptionStyle: React.CSSProperties = {
  resize: 'vertical',
  minHeight: 64,
  fontFamily: 'inherit',
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-disabled)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border-strong)',
  flexShrink: 0,
};

const panelBodyStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  overflowY: 'auto',
  // Without this the flex item will not shrink below its content, so overflowY
  // never engages and the panel is clipped instead of scrolling.
  minHeight: 0,
  flex: 1,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

// Two columns: the four mode names do not fit on one row of a 280px panel.
const toggleGroupStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 4,
};

const toggleBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 4px',
  fontSize: 11,
  fontWeight: 500,
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--text-disabled)',
  cursor: 'pointer',
};

const toggleBtnActiveStyle: React.CSSProperties = {
  background: 'var(--primary-pressed)',
  borderColor: 'var(--primary)',
  color: 'var(--text-on-primary)',
};

const spinnerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--text-secondary)',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  border: '2px solid var(--border)',
  borderTopColor: 'var(--primary)',
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
  color: 'var(--text-disabled)',
  background: 'var(--surface-alt)',
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
    border: '1px solid var(--border)',
    background: 'transparent',
    color: enabled ? 'var(--text)' : 'var(--text-secondary)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
  };
}

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border-strong)',
  margin: '2px 0',
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  borderRadius: 8,
  padding: '0 5px',
  fontWeight: 700,
};

const decisionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 8px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
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
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const decisionTargetStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
};

const conditionalBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--warning)',
  background: 'var(--warning-bg)',
  border: '1px solid var(--warning)',
  borderRadius: 3,
  padding: '1px 5px',
  flexShrink: 0,
};

const arrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  flexShrink: 0,
};

const addFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
};

const addFormActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
};
