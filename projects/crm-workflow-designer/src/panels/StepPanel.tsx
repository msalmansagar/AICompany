import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Field,
  Input,
  Textarea,
  RadioGroup,
  Radio,
  Spinner,
  Badge,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowStep, UserOption, TeamOption } from '@/types/WorkflowTypes';
import { ASSIGN_TO_TYPES } from '@/services/taskAssignment';

const stepPanelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  schemaName: z.string(),
  sequenceNo: z.number().int().min(1, 'Sequence must be ≥ 1'),
  taskSubject: z.string(),
  taskDescription: z.string(),
  assignTo: z.enum(ASSIGN_TO_TYPES),
  assignedUserId: z.string().nullable(),
  teamId: z.string().nullable(),
  roundRobinTeamId: z.string().nullable(),
});

type StepFormValues = z.infer<typeof stepPanelSchema>;

interface StepPanelProps {
  step: WorkflowStep;
}

export function StepPanel({ step }: StepPanelProps) {
  const adapter = useCrmAdapter();
  const setStep = useWorkflowStore((s) => s.setStep);

  const { data: users = [], isLoading: isLoadingUsers, error: usersError } = useQuery({
    queryKey: ['users'],
    queryFn: () => adapter.getUsers(),
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });

  const { data: teams = [], isLoading: isLoadingTeams, error: teamsError } = useQuery({
    queryKey: ['teams'],
    queryFn: () => adapter.getTeams(),
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });

  const { control, watch, reset, formState: { errors } } = useForm<StepFormValues>({
    resolver: zodResolver(stepPanelSchema),
    defaultValues: buildDefaults(step),
  });

  useEffect(() => {
    reset(buildDefaults(step));
  }, [step.crmId, reset]);

  const assignTo = watch('assignTo');

  function pushChange<K extends keyof StepFormValues>(field: K, value: StepFormValues[K]): void {
    setStep({ ...step, [field]: value } as WorkflowStep);
  }

  function handleUserSelect(userId: string): void {
    const user = (users as UserOption[]).find((u) => u.id === userId);
    setStep({ ...step, assignedUserId: userId || null, assignedUserName: user?.fullName ?? null });
  }

  function handleTeamSelect(teamId: string): void {
    const team = (teams as TeamOption[]).find((t) => t.id === teamId);
    setStep({ ...step, teamId: teamId || null, teamName: team?.name ?? null });
  }

  function handleRoundRobinTeamSelect(teamId: string): void {
    const team = (teams as TeamOption[]).find((t) => t.id === teamId);
    setStep({ ...step, roundRobinTeamId: teamId || null, roundRobinTeamName: team?.name ?? null });
  }

  return (
    <div style={containerStyle}>
      {/* === Identity === */}
      <Controller control={control} name="name"
        render={({ field }) => (
          <Field label="Step Name" required
            validationMessage={errors.name?.message}
            validationState={errors.name ? 'error' : 'none'}>
            <Input {...field} onChange={(e) => { field.onChange(e); pushChange('name', e.target.value); }} />
          </Field>
        )}
      />

      <div style={rowStyle}>
        <Controller control={control} name="sequenceNo"
          render={({ field }) => (
            <Field label="Sequence No." style={{ flex: 1 }}>
              <Input type="number" value={String(field.value)}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  if (!isNaN(num)) { field.onChange(num); pushChange('sequenceNo', num); }
                }}
              />
            </Field>
          )}
        />
        <Controller control={control} name="schemaName"
          render={({ field }) => (
            <Field label="Schema Name" style={{ flex: 2 }}>
              <Input {...field} placeholder="optional_schema"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                onChange={(e) => { field.onChange(e); pushChange('schemaName', e.target.value); }}
              />
            </Field>
          )}
        />
      </div>

      {/* === Task Details === */}
      <Section title="Task Details">
        <Controller control={control} name="taskSubject"
          render={({ field }) => (
            <Field label="Task Subject">
              <Input {...field} onChange={(e) => { field.onChange(e); pushChange('taskSubject', e.target.value); }} />
            </Field>
          )}
        />
        <Controller control={control} name="taskDescription"
          render={({ field }) => (
            <Field label="Task Description">
              <Textarea {...field} rows={3}
                onChange={(e) => { field.onChange(e); pushChange('taskDescription', e.target.value); }}
              />
            </Field>
          )}
        />
      </Section>

      {/* === Assignment === */}
      <Section title="Assignment">
        <Controller control={control} name="assignTo"
          render={({ field }) => (
            <RadioGroup value={field.value} layout="vertical"
              onChange={(_, data) => {
                const val = data.value as StepFormValues['assignTo'];
                field.onChange(val);
                // Clear previous assignment values when switching type
                setStep({
                  ...step,
                  assignTo: val,
                  assignedUserId: val === 'user' ? step.assignedUserId : null,
                  assignedUserName: val === 'user' ? step.assignedUserName : null,
                  teamId: val === 'team' ? step.teamId : null,
                  teamName: val === 'team' ? step.teamName : null,
                  roundRobinTeamId: val === 'roundRobin' ? step.roundRobinTeamId : null,
                  roundRobinTeamName: val === 'roundRobin' ? step.roundRobinTeamName : null,
                });
              }}
            >
              <Radio value="user" label="Specific User" />
              <Radio value="team" label="Team" />
              <Radio value="roundRobin" label="Round Robin" />
            </RadioGroup>
          )}
        />

        {assignTo === 'user' && (
          <Field label="Assigned User">
            {isLoadingUsers ? <Spinner size="tiny" label="Loading users…" /> : (
              usersError ? <ErrorNote message="Failed to load users" error={usersError} /> : (
                <Controller control={control} name="assignedUserId"
                  render={({ field }) => (
                    <select style={selectStyle} value={field.value ?? ''}
                      onChange={(e) => { field.onChange(e.target.value || null); handleUserSelect(e.target.value); }}>
                      <option value="">Select user…</option>
                      {(users as UserOption[]).map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  )}
                />
              )
            )}
          </Field>
        )}

        {assignTo === 'team' && (
          <Field label="Team">
            {isLoadingTeams ? <Spinner size="tiny" label="Loading teams…" /> : (
              teamsError ? <ErrorNote message="Failed to load teams" error={teamsError} /> : (
                <Controller control={control} name="teamId"
                  render={({ field }) => (
                    <select style={selectStyle} value={field.value ?? ''}
                      onChange={(e) => { field.onChange(e.target.value || null); handleTeamSelect(e.target.value); }}>
                      <option value="">Select team…</option>
                      {(teams as TeamOption[]).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                />
              )
            )}
          </Field>
        )}

        {assignTo === 'roundRobin' && (
          <Field label="Round Robin Team">
            {isLoadingTeams ? <Spinner size="tiny" label="Loading teams…" /> : (
              teamsError ? <ErrorNote message="Failed to load teams" error={teamsError} /> : (
                <Controller control={control} name="roundRobinTeamId"
                  render={({ field }) => (
                    <select style={selectStyle} value={field.value ?? ''}
                      onChange={(e) => { field.onChange(e.target.value || null); handleRoundRobinTeamSelect(e.target.value); }}>
                      <option value="">Select round robin team…</option>
                      {(teams as TeamOption[]).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                />
              )
            )}
          </Field>
        )}
      </Section>

      {/* Step ID badge for diagnostics */}
      {step.crmId.startsWith('tmp_') && (
        <Badge color="warning" size="small">Unsaved — not yet in CRM</Badge>
      )}
    </div>
  );
}

function buildDefaults(step: WorkflowStep): StepFormValues {
  return {
    name: step.name,
    schemaName: step.schemaName,
    sequenceNo: step.sequenceNo,
    taskSubject: step.taskSubject,
    taskDescription: step.taskDescription,
    assignTo: step.assignTo,
    assignedUserId: step.assignedUserId,
    teamId: step.teamId,
    roundRobinTeamId: step.roundRobinTeamId,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <p style={sectionTitleStyle}>{title}</p>
      {children}
    </div>
  );
}

function ErrorNote({ message, error }: { message: string; error?: unknown }) {
  const detail = extractErrorDetail(error);
  return (
    <div style={errorBoxStyle}>
      <strong style={{ fontSize: 12, color: 'var(--error)' }}>{message}</strong>
      {detail && (
        <div style={{ fontSize: 11, marginTop: 4, color: 'var(--error)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function extractErrorDetail(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const xrm = error as Record<string, unknown>;
    if (typeof xrm['message'] === 'string') return xrm['message'];
    return JSON.stringify(xrm, null, 2);
  }
  return String(error);
}

const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8 };
const sectionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0,
};
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px',
  border: '1px solid var(--border-strong)', borderRadius: 4,
  fontSize: 13, background: 'var(--surface)',
};

const errorBoxStyle: React.CSSProperties = {
  background: 'var(--error-bg)',
  border: '1px solid var(--error)',
  borderRadius: 6,
  padding: '8px 10px',
};
