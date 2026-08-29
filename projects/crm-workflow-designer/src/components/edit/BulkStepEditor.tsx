import { useEffect, useMemo, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { emptyAssignmentFields, ASSIGN_TO_LABELS } from '@/services/taskAssignment';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type { AssignToType, TeamOption, UserOption, WorkflowStep } from '@/types/WorkflowTypes';

/**
 * Every step on one screen (CWFD-016 B2).
 *
 * The Loan process arrived with 28 unassigned steps and 35 empty task
 * subjects; fixing that through the per-step panel is 28 rounds of
 * select-card → tab → search. This dialog is the editor-side twin of the
 * create wizard's assignment grid: one row per step — subject, assignment
 * mode, assignee — edited as a draft and applied to the store in one go
 * (which marks the workflow dirty; Save draft persists as usual).
 */

interface BulkStepEditorProps {
  adapter: ICrmAdapter;
  onClose: () => void;
}

interface DraftRow {
  stepId: string;
  taskSubject: string;
  assignTo: AssignToType;
  /** The chosen assignee for the current mode ('' = none). */
  assigneeId: string;
}

function draftFrom(step: WorkflowStep): DraftRow {
  return {
    stepId: step.crmId,
    taskSubject: step.taskSubject,
    assignTo: step.assignTo,
    assigneeId:
      step.assignTo === 'user'
        ? step.assignedUserId ?? ''
        : step.assignTo === 'team'
          ? step.teamId ?? ''
          : step.assignTo === 'roundRobin'
            ? step.roundRobinTeamId ?? ''
            : '',
  };
}

export function BulkStepEditor({ adapter, onClose }: BulkStepEditorProps) {
  const { steps, stepOrder, setStep } = useWorkflowStore((s) => ({
    steps: s.steps,
    stepOrder: s.stepOrder,
    setStep: s.setStep,
  }));

  const orderedSteps = useMemo(
    () => stepOrder.map((id) => steps[id]).filter((s): s is WorkflowStep => Boolean(s)),
    [stepOrder, steps]
  );

  const [rows, setRows] = useState<DraftRow[]>(() => orderedSteps.map(draftFrom));
  const [users, setUsers] = useState<UserOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [roundRobinTeams, setRoundRobinTeams] = useState<TeamOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([adapter.getUsers(), adapter.getTeams(), adapter.getRoundRobinTeams()])
      .then(([u, t, rr]) => {
        setUsers(u);
        setTeams(t);
        setRoundRobinTeams(rr);
      })
      .catch(() => {
        /* non-fatal — the selects stay empty and subjects still work */
      })
      .finally(() => setIsLoading(false));
  }, [adapter]);

  const patchRow = (stepId: string, patch: Partial<DraftRow>) => {
    setRows((previous) =>
      previous.map((row) => (row.stepId === stepId ? { ...row, ...patch } : row))
    );
  };

  const optionsFor = (mode: AssignToType): Array<{ id: string; name: string }> => {
    if (mode === 'user') return users.map((u) => ({ id: u.id, name: u.fullName }));
    if (mode === 'team') return teams;
    if (mode === 'roundRobin') return roundRobinTeams;
    return [];
  };

  const changedCount = useMemo(
    () =>
      rows.filter((row) => {
        const step = steps[row.stepId];
        return step && rowDiffers(row, step);
      }).length,
    [rows, steps]
  );

  const handleApply = () => {
    for (const row of rows) {
      const step = steps[row.stepId];
      if (!step || !rowDiffers(row, step)) continue;
      setStep(applyRow(row, step, optionsFor(row.assignTo)));
    }
    onClose();
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="dialog"
        style={{ width: 'min(980px, 96vw)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Edit all steps"
      >
        <div className="dialog-head">
          <h2>Edit all steps</h2>
        </div>

        <div className="dialog-body" style={bodyStyle}>
          <p className="hint-inline" style={{ margin: 0 }}>
            Task subjects and assignments for every step, in one pass. Changes apply to the
            draft — Save draft persists them.
          </p>

          {isLoading ? (
            <p className="hint-inline">Loading users and teams…</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 34 }}>#</th>
                  <th style={thStyle}>Step</th>
                  <th style={thStyle}>Task subject</th>
                  <th style={{ ...thStyle, width: 150 }}>Assign to</th>
                  <th style={thStyle}>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {orderedSteps.map((step) => {
                  const row = rows.find((r) => r.stepId === step.crmId);
                  if (!row) return null;
                  const assigneeOptions = optionsFor(row.assignTo);
                  const missingSubject = !row.taskSubject.trim();
                  const missingAssignee = row.assignTo !== 'readFromParent' && !row.assigneeId;
                  return (
                    <tr key={step.crmId}>
                      <td style={tdStyle}>
                        <span style={seqStyle}>{step.sequenceNo}</span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 190 }}>
                        <span style={stepNameStyle} title={step.name}>{step.name}</span>
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          className="fluent-input"
                          style={cellInputStyle(missingSubject)}
                          value={row.taskSubject}
                          placeholder={step.name}
                          onChange={(e) => patchRow(step.crmId, { taskSubject: e.target.value })}
                        />
                      </td>
                      <td style={tdStyle}>
                        <select
                          className="fluent-select"
                          style={cellInputStyle(false)}
                          value={row.assignTo}
                          onChange={(e) =>
                            patchRow(step.crmId, {
                              assignTo: e.target.value as AssignToType,
                              assigneeId: '',
                            })
                          }
                        >
                          {(Object.keys(ASSIGN_TO_LABELS) as AssignToType[]).map((mode) => (
                            <option key={mode} value={mode}>
                              {ASSIGN_TO_LABELS[mode]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        {row.assignTo === 'readFromParent' ? (
                          <span className="hint-inline">Configured on the step panel</span>
                        ) : (
                          <select
                            className="fluent-select"
                            style={cellInputStyle(missingAssignee)}
                            value={row.assigneeId}
                            onChange={(e) => patchRow(step.crmId, { assigneeId: e.target.value })}
                          >
                            <option value="">— Not selected —</option>
                            {assigneeOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="dialog-foot">
          <span style={changeCountStyle}>
            {changedCount === 0 ? 'No changes yet' : `${changedCount} step${changedCount === 1 ? '' : 's'} changed`}
          </span>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            onClick={handleApply}
            disabled={changedCount === 0}
          >
            Apply changes
          </button>
        </div>
      </div>
    </div>
  );
}

function rowDiffers(row: DraftRow, step: WorkflowStep): boolean {
  return (
    row.taskSubject !== step.taskSubject ||
    row.assignTo !== step.assignTo ||
    row.assigneeId !== draftFrom(step).assigneeId
  );
}

/**
 * Writes one draft row back onto its step. Switching mode clears the other
 * modes' fields (same contract as the step panel); Read From Parent keeps its
 * three parent lookups when the mode did not change, because this grid cannot
 * edit them.
 */
function applyRow(
  row: DraftRow,
  step: WorkflowStep,
  assigneeOptions: Array<{ id: string; name: string }>
): WorkflowStep {
  const next: WorkflowStep = { ...step, taskSubject: row.taskSubject };
  const modeChanged = row.assignTo !== step.assignTo;
  if (!modeChanged && row.assigneeId === draftFrom(step).assigneeId) return next;

  const assigneeName = assigneeOptions.find((o) => o.id === row.assigneeId)?.name ?? null;
  const cleared = modeChanged ? { ...next, ...emptyAssignmentFields(), assignTo: row.assignTo } : next;

  if (row.assignTo === 'user') {
    return { ...cleared, assignedUserId: row.assigneeId || null, assignedUserName: assigneeName };
  }
  if (row.assignTo === 'team') {
    return { ...cleared, teamId: row.assigneeId || null, teamName: assigneeName };
  }
  if (row.assignTo === 'roundRobin') {
    return { ...cleared, roundRobinTeamId: row.assigneeId || null, roundRobinTeamName: assigneeName };
  }
  return cleared;
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: '68vh',
  overflowY: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  background: 'var(--surface)',
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-strong)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-disabled)',
  zIndex: 1,
};

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
};

const seqStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: 'var(--text-on-primary)',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  padding: '1px 6px',
};

const stepNameStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function cellInputStyle(flagMissing: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: 30,
    fontSize: 12,
    ...(flagMissing ? { borderColor: 'var(--warning)' } : null),
  };
}

const changeCountStyle: React.CSSProperties = {
  marginRight: 'auto',
  fontSize: 12,
  color: 'var(--text-secondary)',
  alignSelf: 'center',
};
