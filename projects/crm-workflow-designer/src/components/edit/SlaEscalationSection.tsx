import { useEffect, useState, useCallback } from 'react';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { isSopAdapter } from '@/services/ISopAdapter';
import type {
  WorkflowStep,
  SlaDurationUnit,
  SlaBasis,
  EscalationAction,
  EscalationTargetType,
} from '@/types/WorkflowTypes';
import { SearchableDropdown } from '@/components/common/SearchableDropdown';
import { validateSlaConfig } from '@/validators/slaValidator';

interface SlaEscalationSectionProps {
  step: WorkflowStep;
  setStep: (step: WorkflowStep) => void;
  adapter: ICrmAdapter;
}

type Option = { id: string; name: string };

const UNIT_OPTIONS: Array<{ value: SlaDurationUnit; label: string }> = [
  { value: 'Hours', label: 'Hours' },
  { value: 'CalendarDays', label: 'Calendar Days' },
  { value: 'BusinessDays', label: 'Business Days' },
];

// PreviousStepCompleted is intentionally omitted from the maker dropdown (CEO
// decision) — the runtime can't yet confirm step-completion timestamps. The
// option-set code still exists in the schema for a future release.
const BASIS_OPTIONS: Array<{ value: SlaBasis; label: string }> = [
  { value: 'TaskCreated', label: 'Task Created' },
  { value: 'TaskAssigned', label: 'Task Assigned' },
];

const ACTION_OPTIONS: Array<{ value: EscalationAction; label: string }> = [
  { value: 'Reassign', label: 'Reassign' },
  { value: 'Notify', label: 'Notify' },
  { value: 'Flag', label: 'Flag' },
  { value: 'ReassignAndNotify', label: 'Reassign & Notify' },
];

const TARGET_TYPE_OPTIONS: Array<{ value: EscalationTargetType; label: string }> = [
  { value: 'SpecificUser', label: 'Specific User' },
  { value: 'SpecificTeam', label: 'Specific Team' },
  { value: 'ManagerOfAssignee', label: 'Manager of Assignee' },
  { value: 'Role', label: 'Role' },
];

export function SlaEscalationSection({ step, setStep, adapter }: SlaEscalationSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [users, setUsers] = useState<Option[]>([]);
  const [teams, setTeams] = useState<Option[]>([]);
  const [roles, setRoles] = useState<Option[]>([]);

  const patch = useCallback(
    (fields: Partial<WorkflowStep>) => setStep({ ...step, ...fields }),
    [setStep, step]
  );

  const targetType = step.escalationTargetType;
  useEffect(() => {
    if (targetType === 'SpecificUser' && users.length === 0) {
      adapter.getUsers().then((list) => setUsers(list.map((u) => ({ id: u.id, name: u.fullName })))).catch(() => setUsers([]));
    }
    if (targetType === 'SpecificTeam' && teams.length === 0) {
      adapter.getTeams().then(setTeams).catch(() => setTeams([]));
    }
    if (targetType === 'Role' && roles.length === 0 && isSopAdapter(adapter)) {
      adapter.getRoles().then((list) => setRoles(list.map((r) => ({ id: r.id, name: r.name })))).catch(() => setRoles([]));
    }
  }, [targetType, adapter, users.length, teams.length, roles.length]);

  const errors = validateSlaConfig(step);

  return (
    <div>
      <button type="button" style={headerStyle} onClick={() => setExpanded((v) => !v)}>
        <span style={caretStyle}>{expanded ? '▾' : '▸'}</span>
        <span>SLA &amp; Escalation</span>
        {!expanded && step.slaEnabled && <span style={summaryBadgeStyle}>{summaryText(step)}</span>}
      </button>

      {expanded && (
        <div style={bodyStyle}>
          <div style={noticeStyle}>
            Configuration only — SLA enforcement requires the CWFD-005 runtime to be active.
          </div>

          <ToggleRow label="Enable SLA" on={step.slaEnabled} onChange={(on) => patch({ slaEnabled: on })} />

          {step.slaEnabled && (
            <>
              <div style={rowStyle}>
                <Field label="Duration" error={errors.slaDuration} style={{ flex: 1 }}>
                  <input
                    type="number"
                    min={1}
                    value={step.slaDuration ?? ''}
                    onChange={(e) => patch({ slaDuration: e.target.value === '' ? null : Number(e.target.value) })}
                    style={inputStyle}
                    placeholder="e.g. 2"
                  />
                </Field>
                <Field label="Unit" error={errors.slaDurationUnit} style={{ flex: 1 }}>
                  <Select
                    value={step.slaDurationUnit ?? ''}
                    onChange={(v) => patch({ slaDurationUnit: (v || null) as SlaDurationUnit | null })}
                    options={UNIT_OPTIONS}
                  />
                </Field>
              </div>

              <Field label="SLA clock starts when" error={errors.slaBasis}>
                <Select
                  value={step.slaBasis ?? ''}
                  onChange={(v) => patch({ slaBasis: (v || null) as SlaBasis | null })}
                  options={BASIS_OPTIONS}
                />
              </Field>

              <Field label="Warning at (% of SLA)" error={errors.slaWarningPct} hint="Notifies the task assignee. Leave blank to skip.">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={step.slaWarningPct ?? ''}
                  onChange={(e) => patch({ slaWarningPct: e.target.value === '' ? null : Number(e.target.value) })}
                  style={inputStyle}
                  placeholder="optional"
                />
              </Field>

              <ToggleRow
                label="Enable Escalation"
                on={step.escalationEnabled}
                onChange={(on) => patch({ escalationEnabled: on })}
              />

              {step.escalationEnabled && (
                <>
                  <Field label="Escalation action" error={errors.escalationAction}>
                    <Select
                      value={step.escalationAction ?? ''}
                      onChange={(v) => patch({ escalationAction: (v || null) as EscalationAction | null })}
                      options={ACTION_OPTIONS}
                    />
                  </Field>

                  <Field label="Target type" error={errors.escalationTargetType}>
                    <Select
                      value={step.escalationTargetType ?? ''}
                      onChange={(v) =>
                        patch({
                          escalationTargetType: (v || null) as EscalationTargetType | null,
                          escalationUserId: null,
                          escalationUserName: null,
                          escalationTeamId: null,
                          escalationTeamName: null,
                          escalationRoleId: null,
                          escalationRoleName: null,
                        })
                      }
                      options={TARGET_TYPE_OPTIONS}
                    />
                  </Field>

                  {step.escalationTargetType === 'SpecificUser' && (
                    <FieldError error={errors.escalationUserId}>
                      <SearchableDropdown
                        label="Escalation user"
                        placeholder="Search users…"
                        options={users}
                        value={step.escalationUserId}
                        onChange={(id, name) => patch({ escalationUserId: id, escalationUserName: name })}
                      />
                    </FieldError>
                  )}
                  {step.escalationTargetType === 'SpecificTeam' && (
                    <FieldError error={errors.escalationTeamId}>
                      <SearchableDropdown
                        label="Escalation team"
                        placeholder="Search teams…"
                        options={teams}
                        value={step.escalationTeamId}
                        onChange={(id, name) => patch({ escalationTeamId: id, escalationTeamName: name })}
                      />
                    </FieldError>
                  )}
                  {step.escalationTargetType === 'Role' && (
                    <FieldError error={errors.escalationRoleId}>
                      <SearchableDropdown
                        label="Escalation role"
                        placeholder="Search roles…"
                        options={roles}
                        value={step.escalationRoleId}
                        onChange={(id, name) => patch({ escalationRoleId: id, escalationRoleName: name })}
                      />
                    </FieldError>
                  )}
                  {step.escalationTargetType === 'ManagerOfAssignee' && (
                    <div style={hintStyle}>
                      Manager of the assignee is resolved by the runtime using the CRM user hierarchy. No selection needed.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function summaryText(step: WorkflowStep): string {
  const unit = UNIT_OPTIONS.find((u) => u.value === step.slaDurationUnit)?.label ?? '';
  const sla = `SLA: ${step.slaDuration ?? '?'} ${unit}`.trim();
  if (!step.escalationEnabled || !step.escalationAction) return sla;
  const action = ACTION_OPTIONS.find((a) => a.value === step.escalationAction)?.label ?? '';
  return `${sla} | ${action}`;
}

// --- small building blocks ---

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div style={toggleRowStyle}>
      <span style={toggleLabelStyle}>{label}</span>
      <div style={toggleGroupStyle}>
        <button type="button" style={{ ...toggleBtnStyle, ...(!on ? toggleBtnActiveStyle : {}) }} onClick={() => onChange(false)}>Off</button>
        <button type="button" style={{ ...toggleBtnStyle, ...(on ? toggleBtnActiveStyle : {}) }} onClick={() => onChange(true)}>On</button>
      </div>
    </div>
  );
}

function Field({
  label, error, hint, style, children,
}: {
  label: string;
  error?: string;
  hint?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div style={{ ...fieldStyle, ...style }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && !error && <span style={hintStyle}>{hint}</span>}
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}

function FieldError({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div style={fieldStyle}>
      {children}
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}

function Select<T extends string>({
  value, onChange, options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// --- styles (match the dark step panel) ---

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 0',
  background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', textAlign: 'left',
};
const caretStyle: React.CSSProperties = { fontSize: 10, color: '#64748b' };
const summaryBadgeStyle: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#fbbf24',
  background: '#451a03', border: '1px solid #92400e', borderRadius: 3, padding: '1px 5px',
  textTransform: 'none', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150,
};
const bodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 };
const noticeStyle: React.CSSProperties = {
  fontSize: 10, color: '#fbbf24', background: '#1c1917', border: '1px solid #422006',
  borderRadius: 4, padding: '6px 8px', lineHeight: 1.4,
};
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8 };
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em',
};
const inputStyle: React.CSSProperties = {
  height: 30, padding: '0 8px', background: '#1e293b', border: '1px solid #334155',
  borderRadius: 4, color: '#e2e8f0', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle };
const hintStyle: React.CSSProperties = { fontSize: 10, color: '#64748b', lineHeight: 1.4 };
const errorStyle: React.CSSProperties = { fontSize: 10, color: '#f87171', fontWeight: 600, lineHeight: 1.4 };
const toggleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const toggleLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#94a3b8' };
const toggleGroupStyle: React.CSSProperties = { display: 'flex', gap: 4 };
const toggleBtnStyle: React.CSSProperties = {
  width: 40, height: 26, fontSize: 11, fontWeight: 500, border: '1px solid #334155',
  borderRadius: 4, background: 'transparent', color: '#94a3b8', cursor: 'pointer',
};
const toggleBtnActiveStyle: React.CSSProperties = { background: '#1d4ed8', borderColor: '#3b82f6', color: '#fff' };
