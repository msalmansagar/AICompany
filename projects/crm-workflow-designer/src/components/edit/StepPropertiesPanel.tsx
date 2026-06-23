import { useEffect, useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import type { AssignToType, TeamOption, UserOption } from '@/types/WorkflowTypes';
import { SearchableDropdown } from '@/components/common/SearchableDropdown';

interface StepPropertiesPanelProps {
  stepId: string | null;
  adapter: ICrmAdapter;
}

type AssigneeOption = { id: string; name: string };

export function StepPropertiesPanel({ stepId, adapter }: StepPropertiesPanelProps) {
  const { steps, setStep } = useWorkflowStore((s) => ({
    steps: s.steps,
    setStep: s.setStep,
  }));

  const step = stepId ? steps[stepId] : null;

  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);

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

  const handleNameChange = (name: string) => {
    setStep({ ...step, name });
  };

  const handleSequenceNoChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) setStep({ ...step, sequenceNo: parsed });
  };

  const handleAssignToChange = (assignTo: AssignToType) => {
    setStep({
      ...step,
      assignTo,
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

  const currentAssigneeId =
    step.assignTo === 'user'
      ? step.assignedUserId
      : step.assignTo === 'team'
      ? step.teamId
      : step.roundRobinTeamId;

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>Step Properties</div>

      <div style={panelBodyStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={step.name}
            onChange={(e) => handleNameChange(e.target.value)}
            style={inputStyle}
            placeholder="Step name"
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Sequence No</label>
          <input
            type="number"
            value={step.sequenceNo}
            onChange={(e) => handleSequenceNoChange(e.target.value)}
            style={inputStyle}
            min={1}
          />
        </div>

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
  gap: 14,
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

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: '#475569',
  fontStyle: 'italic',
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
