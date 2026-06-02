import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Field,
  Input,
  Switch,
  Button,
} from '@fluentui/react-components';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowOutcome, EntityOption } from '@/types/WorkflowTypes';
import { FetchXmlBuilderDialog } from '@/components/FetchXmlBuilder/FetchXmlBuilderDialog';
import { useCrmAdapter } from '@/app/CrmAdapterContext';

const outcomePanelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sequenceNumber: z.number().int().min(0),
  applyFilter: z.boolean(),
});

type OutcomeFormValues = z.infer<typeof outcomePanelSchema>;

interface OutcomePanelProps {
  outcome: WorkflowOutcome;
}

export function OutcomePanel({ outcome }: OutcomePanelProps) {
  const adapter = useCrmAdapter();
  const setOutcome = useWorkflowStore((s) => s.setOutcome);
  const process = useWorkflowStore((s) => s.process);
  const [isFetchXmlOpen, setIsFetchXmlOpen] = useState(false);
  const [clientUrl, setClientUrl] = useState('');
  const [objectTypeCode, setObjectTypeCode] = useState(0);

  const { control, reset, formState: { errors } } = useForm<OutcomeFormValues>({
    resolver: zodResolver(outcomePanelSchema),
    defaultValues: {
      name: outcome.name,
      sequenceNumber: outcome.sequenceNumber,
      applyFilter: outcome.applyFilter,
    },
  });

  useEffect(() => {
    reset({
      name: outcome.name,
      sequenceNumber: outcome.sequenceNumber,
      applyFilter: outcome.applyFilter,
    });
  }, [outcome.crmId, reset]);

  useEffect(() => {
    if (!process?.recordEntity) return;
    const loadEntityMeta = async () => {
      const entities = await adapter.getEntities();
      const entity = entities.find((e: EntityOption) => e.logicalName === process.recordEntity);
      if (entity) setObjectTypeCode(entity.objectTypeCode);
    };

    // Attempt to resolve clientUrl from Xrm context
    try {
      const xrmAny = (window as unknown as Record<string, unknown>)['Xrm'] as typeof Xrm | undefined;
      if (xrmAny?.Utility) {
        setClientUrl(xrmAny.Utility.getGlobalContext().getClientUrl());
      }
    } catch {
      setClientUrl(window.location.origin);
    }

    loadEntityMeta().catch(() => void 0);
  }, [process?.recordEntity, adapter]);

  function handleFieldChange(field: keyof OutcomeFormValues, value: string | number | boolean): void {
    setOutcome({ ...outcome, [field]: value });
  }

  function handleFetchXmlApply(fetchXml: string): void {
    // FetchXML is stored on routes, not outcomes — notify user to open route editor
    // This dialog from OutcomePanel sets a preview; actual save is on route
    void fetchXml;
    setIsFetchXmlOpen(false);
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
        name="sequenceNumber"
        render={({ field }) => (
          <Field label="Sequence Number">
            <Input
              type="number"
              value={String(field.value)}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                field.onChange(num);
                handleFieldChange('sequenceNumber', num);
              }}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="applyFilter"
        render={({ field }) => (
          <Switch
            label="Apply Filter"
            checked={field.value}
            onChange={(_, data) => {
              field.onChange(data.checked);
              handleFieldChange('applyFilter', data.checked);
            }}
          />
        )}
      />

      {outcome.applyFilter && (
        <Button
          appearance="secondary"
          onClick={() => setIsFetchXmlOpen(true)}
        >
          Open FetchXML Builder
        </Button>
      )}

      {isFetchXmlOpen && (
        <FetchXmlBuilderDialog
          open={isFetchXmlOpen}
          entityLogicalName={process?.recordEntity ?? ''}
          objectTypeCode={objectTypeCode}
          clientUrl={clientUrl}
          onApply={handleFetchXmlApply}
          onDismiss={() => setIsFetchXmlOpen(false)}
        />
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};
