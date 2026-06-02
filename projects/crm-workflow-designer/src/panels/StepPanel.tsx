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
  Switch,
  Spinner,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowStep, UserOption, TeamOption } from '@/types/WorkflowTypes';
import { AttributeCombobox } from './shared/AttributeCombobox';
import { EntityCombobox } from './shared/EntityCombobox';

const stepPanelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  schemaName: z.string(),
  sequenceNo: z.number().int().min(1),
  taskSubject: z.string(),
  taskDescription: z.string(),
  recordEntity: z.string(),
  regardingField: z.string(),
  parentEntity: z.string(),
  assignTo: z.enum(['user', 'team']),
  assignedUserId: z.string().nullable(),
  teamId: z.string().nullable(),
  enableRoundRobin: z.boolean(),
  roundRobinTeamId: z.string().nullable(),
});

type StepFormValues = z.infer<typeof stepPanelSchema>;

interface StepPanelProps {
  step: WorkflowStep;
}

export function StepPanel({ step }: StepPanelProps) {
  const adapter = useCrmAdapter();
  const setStep = useWorkflowStore((s) => s.setStep);

  const { data: entities = [] } = useQuery({
    queryKey: ['entities'],
    queryFn: () => adapter.getEntities(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => adapter.getUsers(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: teams = [], isLoading: isLoadingTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => adapter.getTeams(),
    staleTime: 2 * 60 * 1000,
  });

  const { control, watch, reset, formState: { errors } } = useForm<StepFormValues>({
    resolver: zodResolver(stepPanelSchema),
    defaultValues: {
      name: step.name,
      schemaName: step.schemaName,
      sequenceNo: step.sequenceNo,
      taskSubject: step.taskSubject,
      taskDescription: step.taskDescription,
      recordEntity: step.recordEntity,
      regardingField: step.regardingField,
      parentEntity: step.parentEntity,
      assignTo: step.assignTo,
      assignedUserId: step.assignedUserId,
      teamId: step.teamId,
      enableRoundRobin: step.enableRoundRobin,
      roundRobinTeamId: step.roundRobinTeamId,
    },
  });

  useEffect(() => {
    reset({
      name: step.name,
      schemaName: step.schemaName,
      sequenceNo: step.sequenceNo,
      taskSubject: step.taskSubject,
      taskDescription: step.taskDescription,
      recordEntity: step.recordEntity,
      regardingField: step.regardingField,
      parentEntity: step.parentEntity,
      assignTo: step.assignTo,
      assignedUserId: step.assignedUserId,
      teamId: step.teamId,
      enableRoundRobin: step.enableRoundRobin,
      roundRobinTeamId: step.roundRobinTeamId,
    });
  }, [step.crmId, reset]);

  const assignTo = watch('assignTo');
  const enableRoundRobin = watch('enableRoundRobin');
  const recordEntity = watch('recordEntity');

  function handleFieldChange<K extends keyof StepFormValues>(
    field: K,
    value: StepFormValues[K]
  ): void {
    setStep({ ...step, [field]: value } as WorkflowStep);
  }

  return (
    <div style={containerStyle}>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Field
            label="Name"
            required
            validationMessage={errors.name?.message}
            validationState={errors.name ? 'error' : 'none'}
          >
            <Input
              {...field}
              onChange={(e) => {
                field.onChange(e);
                handleFieldChange('name', e.target.value);
              }}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="schemaName"
        render={({ field }) => (
          <Field
            label="Schema Name"
            validationMessage={errors.schemaName?.message}
            validationState={errors.schemaName ? 'error' : 'none'}
          >
            <Input
              {...field}
              onChange={(e) => {
                field.onChange(e);
                handleFieldChange('schemaName', e.target.value);
              }}
              placeholder="optional_schema_name"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="sequenceNo"
        render={({ field }) => (
          <Field label="Sequence Number">
            <Input
              type="number"
              value={String(field.value)}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                field.onChange(num);
                handleFieldChange('sequenceNo', num);
              }}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="taskSubject"
        render={({ field }) => (
          <Field label="Task Subject">
            <Input
              {...field}
              onChange={(e) => {
                field.onChange(e);
                handleFieldChange('taskSubject', e.target.value);
              }}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="taskDescription"
        render={({ field }) => (
          <Field label="Task Description">
            <Textarea
              {...field}
              rows={3}
              onChange={(e) => {
                field.onChange(e);
                handleFieldChange('taskDescription', e.target.value);
              }}
            />
          </Field>
        )}
      />

      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Entity Information</span>
        </div>

        <Controller
          control={control}
          name="recordEntity"
          render={({ field }) => (
            <Field label="Task Entity">
              <EntityCombobox
                entities={entities}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  handleFieldChange('recordEntity', value);
                }}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="regardingField"
          render={({ field }) => (
            <Field label="Regarding Field">
              <AttributeCombobox
                entityLogicalName={recordEntity}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  handleFieldChange('regardingField', value);
                }}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="parentEntity"
          render={({ field }) => (
            <Field label="Parent Entity">
              <EntityCombobox
                entities={entities}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  handleFieldChange('parentEntity', value);
                }}
              />
            </Field>
          )}
        />
      </div>

      <div style={sectionStyle}>
        <p style={sectionTitleStyle}>Assignment</p>
        <Controller
          control={control}
          name="assignTo"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onChange={(_, data) => {
                field.onChange(data.value);
                handleFieldChange('assignTo', data.value as 'user' | 'team');
              }}
              layout="horizontal"
            >
              <Radio value="user" label="Specific User" />
              <Radio value="team" label="Team" />
            </RadioGroup>
          )}
        />

        {assignTo === 'user' && (
          <Field label="Assigned User">
            {isLoadingUsers ? (
              <Spinner size="tiny" />
            ) : (
              <Controller
                control={control}
                name="assignedUserId"
                render={({ field }) => (
                  <select
                    style={selectStyle}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      field.onChange(e.target.value || null);
                      const user = users.find((u: UserOption) => u.id === e.target.value);
                      setStep({
                        ...step,
                        assignedUserId: e.target.value || null,
                        assignedUserName: user?.fullName ?? null,
                      });
                    }}
                  >
                    <option value="">Select user...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                )}
              />
            )}
          </Field>
        )}

        {assignTo === 'team' && (
          <>
            <Field label="Team">
              {isLoadingTeams ? (
                <Spinner size="tiny" />
              ) : (
                <Controller
                  control={control}
                  name="teamId"
                  render={({ field }) => (
                    <select
                      style={selectStyle}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        field.onChange(e.target.value || null);
                        const team = teams.find((t: TeamOption) => t.id === e.target.value);
                        setStep({
                          ...step,
                          teamId: e.target.value || null,
                          teamName: team?.name ?? null,
                        });
                      }}
                    >
                      <option value="">Select team...</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                />
              )}
            </Field>

            <Controller
              control={control}
              name="enableRoundRobin"
              render={({ field }) => (
                <Field label="Enable Round Robin">
                  <Switch
                    checked={field.value}
                    onChange={(_, data) => {
                      field.onChange(data.checked);
                      handleFieldChange('enableRoundRobin', data.checked);
                    }}
                    label={field.value ? 'Enabled' : 'Disabled'}
                  />
                </Field>
              )}
            />

            {enableRoundRobin && (
              <Field label="Round Robin Team">
                {isLoadingTeams ? (
                  <Spinner size="tiny" />
                ) : (
                  <Controller
                    control={control}
                    name="roundRobinTeamId"
                    render={({ field }) => (
                      <select
                        style={selectStyle}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          field.onChange(e.target.value || null);
                          const team = teams.find((t: TeamOption) => t.id === e.target.value);
                          setStep({
                            ...step,
                            roundRobinTeamId: e.target.value || null,
                            roundRobinTeamName: team?.name ?? null,
                          });
                        }}
                      >
                        <option value="">Select round robin team...</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                )}
              </Field>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  borderTop: '1px solid #f1f5f9',
  paddingTop: 12,
  marginTop: 4,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 13,
  background: '#fff',
};
