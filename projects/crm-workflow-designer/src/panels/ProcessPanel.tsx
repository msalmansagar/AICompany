import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Field,
  Input,
  Badge,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowProcess } from '@/types/WorkflowTypes';
import { EntityCombobox } from './shared/EntityCombobox';
import { AttributeCombobox } from './shared/AttributeCombobox';

const processPanelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  recordEntity: z.string().min(1, 'Record Entity is required'),
  regardingField: z.string(),
  parentEntity: z.string(),
});

type ProcessFormValues = z.infer<typeof processPanelSchema>;

interface ProcessPanelProps {
  process: WorkflowProcess;
}

export function ProcessPanel({ process }: ProcessPanelProps) {
  const adapter = useCrmAdapter();
  const setProcess = useWorkflowStore((s) => s.setProcess);

  const { data: entities = [] } = useQuery({
    queryKey: ['entities'],
    queryFn: () => adapter.getEntities(),
    staleTime: 5 * 60 * 1000,
  });

  const { control, watch, reset, formState: { errors } } = useForm<ProcessFormValues>({
    resolver: zodResolver(processPanelSchema),
    defaultValues: {
      name: process.name,
      recordEntity: process.recordEntity,
      regardingField: process.regardingField,
      parentEntity: process.parentEntity,
    },
  });

  useEffect(() => {
    reset({
      name: process.name,
      recordEntity: process.recordEntity,
      regardingField: process.regardingField,
      parentEntity: process.parentEntity,
    });
  }, [process.crmId, reset]);

  const recordEntity = watch('recordEntity');

  function handleFieldChange(field: keyof ProcessFormValues, value: string): void {
    setProcess({ ...process, [field]: value });
  }

  const stateLabel = process.workflowState.charAt(0).toUpperCase() + process.workflowState.slice(1);
  const stateColor = process.workflowState === 'published'
    ? 'success'
    : process.workflowState === 'archived'
      ? 'informative'
      : 'warning';

  return (
    <div style={containerStyle}>
      <div style={versionRowStyle}>
        <span style={versionLabelStyle}>
          v{process.versionMajor}.{process.versionMinor}
        </span>
        <Badge color={stateColor} size="small">
          {stateLabel}
        </Badge>
      </div>

      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Field
            label="Process Name"
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
              placeholder="Enter process name"
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="recordEntity"
        render={({ field }) => (
          <Field
            label="Record Entity"
            required
            validationMessage={errors.recordEntity?.message}
            validationState={errors.recordEntity ? 'error' : 'none'}
          >
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
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const versionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
};

const versionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#6b7280',
};
