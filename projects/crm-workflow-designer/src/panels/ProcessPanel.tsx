import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Field,
  Input,
  Badge,
  Spinner,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { WorkflowHooksSection } from '@/components/edit/WorkflowHooksSection';
import { PROCESS_HOOKS } from '@/services/workflowHooks';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowProcess } from '@/types/WorkflowTypes';

const processPanelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  recordEntity: z.string().nullable(),
  regardingField: z.string().nullable(),
  parentEntity: z.string().nullable(),
});

type ProcessFormValues = z.infer<typeof processPanelSchema>;

interface ProcessPanelProps {
  process: WorkflowProcess;
}

export function ProcessPanel({ process }: ProcessPanelProps) {
  const adapter = useCrmAdapter();
  const setProcess = useWorkflowStore((s) => s.setProcess);

  const { data: autoNumberEntities = [], isLoading: isLoadingEntities, error: entitiesError } = useQuery({
    queryKey: ['autoNumberEntities'],
    queryFn: () => adapter.getAutoNumberEntities(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { control, watch, reset, formState: { errors } } = useForm<ProcessFormValues>({
    resolver: zodResolver(processPanelSchema),
    defaultValues: buildDefaults(process),
  });

  useEffect(() => {
    reset(buildDefaults(process));
  }, [process.crmId, reset]);

  const recordEntityId = watch('recordEntity');

  const { data: entityFields = [], isLoading: isLoadingFields, error: fieldsError } = useQuery({
    queryKey: ['autoNumberEntityFields', recordEntityId],
    queryFn: () => adapter.getAutoNumberEntityFields(recordEntityId ?? undefined),
    staleTime: 2 * 60 * 1000,
    retry: 2,
    enabled: !!recordEntityId,
  });

  const stateLabel = process.workflowState.charAt(0).toUpperCase() + process.workflowState.slice(1);
  const stateColor = process.workflowState === 'published'
    ? 'success'
    : process.workflowState === 'archived'
      ? 'informative'
      : 'warning';

  return (
    <div style={containerStyle}>
      <div style={versionRowStyle}>
        <span style={versionLabelStyle}>v{process.versionMajor}.{process.versionMinor}</span>
        <Badge color={stateColor} size="small">{stateLabel}</Badge>
      </div>

      <Controller control={control} name="name"
        render={({ field }) => (
          <Field label="Process Name" required
            validationMessage={errors.name?.message}
            validationState={errors.name ? 'error' : 'none'}>
            <Input {...field}
              onChange={(e) => { field.onChange(e); setProcess({ ...process, name: e.target.value }); }}
              placeholder="Enter process name"
            />
          </Field>
        )}
      />

      <Section title="Entity Information">
        <Field label="Task Entity" hint="qdb_recordentity">
          {isLoadingEntities ? (
            <Spinner size="tiny" label="Loading entities…" />
          ) : entitiesError ? (
            <ErrorNote message="Failed to load entities" error={entitiesError} />
          ) : (
            <Controller control={control} name="recordEntity"
              render={({ field }) => (
                <select style={selectStyle} value={field.value ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    field.onChange(id);
                    setProcess({ ...process, recordEntity: id ?? '', regardingField: '' });
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

        <Field label="Regarding (Parent) Field" hint="qdb_regardingfield">
          {isLoadingFields ? (
            <Spinner size="tiny" label="Loading fields…" />
          ) : fieldsError ? (
            <ErrorNote message="Failed to load fields" error={fieldsError} />
          ) : (
            <Controller control={control} name="regardingField"
              render={({ field }) => (
                <select style={selectStyle} value={field.value ?? ''}
                  disabled={!recordEntityId}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    field.onChange(id);
                    setProcess({ ...process, regardingField: id ?? '' });
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

        <Field label="Parent Entity" hint="qdb_parententity">
          {isLoadingEntities ? (
            <Spinner size="tiny" label="Loading entities…" />
          ) : entitiesError ? (
            <ErrorNote message="Failed to load entities" error={entitiesError} />
          ) : (
            <Controller control={control} name="parentEntity"
              render={({ field }) => (
                <select style={selectStyle} value={field.value ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    field.onChange(id);
                    setProcess({ ...process, parentEntity: id ?? '' });
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

      <Section title="Workflows">
        <WorkflowHooksSection
          value={process.workflowHooks}
          onChange={(workflowHooks) => setProcess({ ...process, workflowHooks })}
          kinds={PROCESS_HOOKS}
          adapter={adapter}
          surface="light"
          scopeNote="Runs for every task in this process. Steps, outcomes and routes may add their own, and the engine runs all of them."
        />
      </Section>
    </div>
  );
}

function buildDefaults(process: WorkflowProcess): ProcessFormValues {
  return {
    name: process.name,
    recordEntity: process.recordEntity || null,
    regardingField: process.regardingField || null,
    parentEntity: process.parentEntity || null,
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
      <strong style={{ fontSize: 12, color: '#991b1b' }}>{message}</strong>
      {detail && (
        <div style={{ fontSize: 11, marginTop: 4, color: '#7f1d1d', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
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

const versionRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 };

const versionLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#6b7280' };

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

const errorBoxStyle: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 6, padding: '8px 10px',
};
