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

const stepPanelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  schemaName: z.string(),
  sequenceNo: z.number().int().min(1, 'Sequence must be ≥ 1'),
  taskSubject: z.string(),
  taskDescription: z.string(),
  recordEntityId: z.string().nullable(),
  regardingFieldId: z.string().nullable(),
  parentEntityId: z.string().nullable(),
  assignTo: z.enum(['user', 'team', 'roundRobin']),
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

  const { data: autoNumberEntities = [], isLoading: isLoadingEntities, error: entitiesError } = useQuery({
    queryKey: ['autoNumberEntities'],
    queryFn: () => adapter.getAutoNumberEntities(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

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
  const recordEntityId = watch('recordEntityId');

  const { data: entityFields = [], isLoading: isLoadingFields, error: fieldsError } = useQuery({
    queryKey: ['autoNumberEntityFields', recordEntityId],
    queryFn: () => adapter.getAutoNumberEntityFields(recordEntityId ?? undefined),
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });

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

      {/* === Entity Information === */}
      <Section title="Entity Information">
        <Field label="Task Entity" hint="qdb_recordentity — lookup to crmi_autonumber_system_entities">
          {isLoadingEntities ? (
            <Spinner size="tiny" label="Loading entities…" />
          ) : entitiesError ? (
            <ErrorNote message="Failed to load entities" />
          ) : (
            <Controller control={control} name="recordEntityId"
              render={({ field }) => (
                <select style={selectStyle} value={field.value ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const name = autoNumberEntities.find((en) => en.id === e.target.value)?.name ?? null;
                    field.onChange(id);
                    setStep({
                      ...step,
                      recordEntityId: id,
                      recordEntityName: name,
                      regardingFieldId: null,
                      regardingFieldName: null,
                    });
                  }}>
                  <option value="">Select task entity…</option>
                  {autoNumberEntities.map((en) => (
                    <option key={en.id} value={en.id}>{en.name}</option>
                  ))}
                </select>
              )}
            />
          )}
        </Field>

        <Field label="Regarding (Parent) Field" hint="qdb_regardingfield — lookup to crmi_autonumber_entities_fields">
          {isLoadingFields ? (
            <Spinner size="tiny" label="Loading fields…" />
          ) : fieldsError ? (
            <ErrorNote message="Failed to load fields" />
          ) : (
            <Controller control={control} name="regardingFieldId"
              render={({ field }) => (
                <select style={selectStyle} value={field.value ?? ''}
                  disabled={!recordEntityId}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const name = entityFields.find((f) => f.id === e.target.value)?.name ?? null;
                    field.onChange(id);
                    setStep({ ...step, regardingFieldId: id, regardingFieldName: name });
                  }}>
                  <option value="">{recordEntityId ? 'Select regarding field…' : 'Select task entity first'}</option>
                  {entityFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              )}
            />
          )}
        </Field>

        <Field label="Parent Entity" hint="qdb_parententity — lookup to crmi_autonumber_system_entities">
          {isLoadingEntities ? (
            <Spinner size="tiny" label="Loading entities…" />
          ) : entitiesError ? (
            <ErrorNote message="Failed to load entities" />
          ) : (
            <Controller control={control} name="parentEntityId"
              render={({ field }) => (
                <select style={selectStyle} value={field.value ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const name = autoNumberEntities.find((en) => en.id === e.target.value)?.name ?? null;
                    field.onChange(id);
                    setStep({ ...step, parentEntityId: id, parentEntityName: name });
                  }}>
                  <option value="">Select parent entity…</option>
                  {autoNumberEntities.map((en) => (
                    <option key={en.id} value={en.id}>{en.name}</option>
                  ))}
                </select>
              )}
            />
          )}
        </Field>
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
              usersError ? <ErrorNote message="Failed to load users" /> : (
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
              teamsError ? <ErrorNote message="Failed to load teams" /> : (
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
              teamsError ? <ErrorNote message="Failed to load teams" /> : (
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
    recordEntityId: step.recordEntityId,
    regardingFieldId: step.regardingFieldId,
    parentEntityId: step.parentEntityId,
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

function ErrorNote({ message }: { message: string }) {
  return <span style={errorNoteStyle}>{message}</span>;
}

const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8 };
const sectionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 4,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: '#64748b', margin: 0,
};
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px',
  border: '1px solid #d1d5db', borderRadius: 4,
  fontSize: 13, background: '#fff',
};

const errorNoteStyle: React.CSSProperties = {
  fontSize: 12, color: '#dc2626', fontStyle: 'italic',
};
