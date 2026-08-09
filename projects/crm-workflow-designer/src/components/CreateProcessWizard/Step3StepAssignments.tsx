// src/components/CreateProcessWizard/Step3StepAssignments.tsx
import { useState, useEffect, useCallback } from 'react';
import { useSopAdapter } from '@/hooks/useSopAdapter';
import type { SopStep } from '@/types/SopTypes';
import type { UserOption, TeamOption } from '@/types/WorkflowTypes';
import type { Step3Values } from './wizardSchemas';
import type { StepAssignment } from '@/types/SopTypes';

const ASSIGN_NONE = null;
const ASSIGN_USER = 100000000;
const ASSIGN_TEAM = 100000002;

interface Step3StepAssignmentsProps {
  sopSteps: SopStep[];
  initialValues: Step3Values;
  onValidated(values: Step3Values): void;
  onBack(): void;
}

interface AssignmentRow {
  sopStepId: string;
  stepName: string;
  sequenceNo: number;
  taskSubject: string;
  assignToType: number | null;
  assignedUserId: string;
  teamId: string;
  enableRoundRobin: boolean;
  roundRobinTeamId: string;
}

function buildInitialRows(sopSteps: SopStep[], initial: StepAssignment[]): AssignmentRow[] {
  return sopSteps
    .slice()
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .map((step) => {
      const existing = initial.find((a) => a.sopStepId === step.id);
      return {
        sopStepId: step.id,
        stepName: step.name,
        sequenceNo: step.sequenceNo,
        taskSubject: existing?.taskSubject ?? step.name,
        assignToType: existing?.assignToType ?? ASSIGN_NONE,
        assignedUserId: existing?.assignedUserId ?? '',
        teamId: existing?.teamId ?? '',
        enableRoundRobin: existing?.enableRoundRobin ?? false,
        roundRobinTeamId: existing?.roundRobinTeamId ?? '',
      };
    });
}

function rowToAssignment(row: AssignmentRow): StepAssignment {
  return {
    sopStepId: row.sopStepId,
    taskSubject: row.taskSubject,
    assignToType: row.assignToType,
    assignedUserId: row.assignedUserId || undefined,
    teamId: row.teamId || undefined,
    enableRoundRobin: row.enableRoundRobin,
    roundRobinTeamId: row.roundRobinTeamId || undefined,
  };
}

export function Step3StepAssignments({
  sopSteps,
  initialValues,
  onValidated,
  onBack,
}: Step3StepAssignmentsProps) {
  const adapter = useSopAdapter();
  const [rows, setRows] = useState<AssignmentRow[]>(() =>
    buildInitialRows(sopSteps, initialValues.stepAssignments)
  );
  const [users, setUsers] = useState<UserOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [roundRobinTeams, setRoundRobinTeams] = useState<TeamOption[]>([]);
  const [isLoadingLookups, setIsLoadingLookups] = useState(true);

  useEffect(() => {
    Promise.all([
      adapter.getUsers(),
      adapter.getTeams(),
      adapter.getRoundRobinTeams(),
    ])
      .then(([u, t, rr]) => { setUsers(u); setTeams(t); setRoundRobinTeams(rr); })
      .catch(() => { /* non-fatal — dropdowns will be empty */ })
      .finally(() => setIsLoadingLookups(false));
  }, [adapter]);

  const updateRow = useCallback((index: number, patch: Partial<AssignmentRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    const updated = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onValidated({ stepAssignments: updated.map(rowToAssignment) });
  }, [rows, onValidated]);

  if (isLoadingLookups) {
    return (
      <div style={spinnerRowStyle}>
        <span style={spinnerStyle} /> Loading assignment options…
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <p style={hintStyle}>
        Assign each SOP step to a user, team, or leave unassigned. These become the task owners in the derived process.
      </p>

      <div style={tableStyle}>
        {rows.map((row, index) => (
          <AssignmentRowCard
            key={row.sopStepId}
            row={row}
            users={users}
            teams={teams}
            roundRobinTeams={roundRobinTeams}
            onChange={(patch) => updateRow(index, patch)}
          />
        ))}
      </div>

      <div style={footerStyle}>
        <button type="button" style={backBtnStyle} onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}

function AssignmentRowCard({
  row,
  users,
  teams,
  roundRobinTeams,
  onChange,
}: {
  row: AssignmentRow;
  users: UserOption[];
  teams: TeamOption[];
  roundRobinTeams: TeamOption[];
  onChange(patch: Partial<AssignmentRow>): void;
}) {
  return (
    <div style={rowCardStyle}>
      <div style={rowHeaderStyle}>
        <span style={seqBadgeStyle}>{row.sequenceNo}</span>
        <span style={stepNameStyle}>{row.stepName}</span>
      </div>

      <div style={rowFieldsStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Task Subject</label>
          <input
            type="text"
            value={row.taskSubject}
            onChange={(e) => onChange({ taskSubject: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Assign To</label>
          <select
            value={row.assignToType ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              onChange({
                assignToType: val === '' ? ASSIGN_NONE : Number(val),
                assignedUserId: '',
                teamId: '',
                enableRoundRobin: false,
                roundRobinTeamId: '',
              });
            }}
            style={selectStyle}
          >
            <option value="">— Unassigned —</option>
            <option value={ASSIGN_USER}>User</option>
            <option value={ASSIGN_TEAM}>Team</option>
          </select>
        </div>

        {row.assignToType === ASSIGN_USER && (
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Assigned User</label>
            <select
              value={row.assignedUserId}
              onChange={(e) => onChange({ assignedUserId: e.target.value })}
              style={selectStyle}
            >
              <option value="">— Select user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        )}

        {row.assignToType === ASSIGN_TEAM && (
          <>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Team</label>
              <select
                value={row.teamId}
                onChange={(e) => onChange({ teamId: e.target.value })}
                style={selectStyle}
              >
                <option value="">— Select team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div style={checkboxRowStyle}>
              <input
                type="checkbox"
                id={`rr-${row.sopStepId}`}
                checked={row.enableRoundRobin}
                onChange={(e) => onChange({ enableRoundRobin: e.target.checked, roundRobinTeamId: '' })}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor={`rr-${row.sopStepId}`} style={checkboxLabelStyle}>
                Enable Round Robin
              </label>
            </div>

            {row.enableRoundRobin && (
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Round Robin Team</label>
                <select
                  value={row.roundRobinTeamId}
                  onChange={(e) => onChange({ roundRobinTeamId: e.target.value })}
                  style={selectStyle}
                >
                  <option value="">— Select round robin team —</option>
                  {roundRobinTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };
const hintStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 };
const tableStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' };

const rowCardStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '12px 14px', background: 'var(--surface)',
};

const rowHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
};

const seqBadgeStyle: React.CSSProperties = {
  background: 'var(--primary)', color: 'var(--text-on-primary)', borderRadius: 4,
  fontSize: 10, fontWeight: 700, padding: '1px 6px', flexShrink: 0,
};

const stepNameStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text)',
};

const rowFieldsStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
};

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text)' };

const inputStyle: React.CSSProperties = {
  height: 30, padding: '0 8px',
  background: 'var(--surface)', border: '1px solid var(--border-strong)',
  borderRadius: 5, color: 'var(--text)', fontSize: 12,
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  height: 30, padding: '0 6px',
  background: 'var(--surface)', border: '1px solid var(--border-strong)',
  borderRadius: 5, color: 'var(--text)', fontSize: 12,
  cursor: 'pointer', width: '100%',
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
};

const checkboxLabelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text)', cursor: 'pointer',
};

const spinnerRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 13, color: 'var(--text-secondary)', padding: '20px 0',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block', width: 14, height: 14,
  border: '2px solid var(--border)', borderTopColor: 'var(--primary)',
  borderRadius: '50%', animation: 'spin 0.7s linear infinite',
};

const footerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-start', paddingTop: 4,
};

const backBtnStyle: React.CSSProperties = {
  height: 34, padding: '0 16px',
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
