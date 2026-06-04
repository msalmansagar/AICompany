import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Field,
  Input,
  Button,
  Text,
} from '@fluentui/react-components';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowRoute } from '@/types/WorkflowTypes';
import { FetchXmlBuilderDialog } from '@/components/FetchXmlBuilder/FetchXmlBuilderDialog';
import { useCrmAdapter } from '@/app/CrmAdapterContext';

const routePanelSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  subject: z.string(),
  sequenceNumber: z.number().int().min(0),
});

type RouteFormValues = z.infer<typeof routePanelSchema>;

interface RoutePanelProps {
  route: WorkflowRoute;
}

export function RoutePanel({ route }: RoutePanelProps) {
  const adapter = useCrmAdapter();
  const setRoute = useWorkflowStore((s) => s.setRoute);
  const process = useWorkflowStore((s) => s.process);
  const steps = useWorkflowStore((s) => s.steps);
  const [isFetchXmlOpen, setIsFetchXmlOpen] = useState(false);
  const [clientUrl, setClientUrl] = useState('');
  const [objectTypeCode, setObjectTypeCode] = useState(0);

  const nextStep = route.nextStepId ? steps[route.nextStepId] : null;

  const { control, reset, formState: { errors } } = useForm<RouteFormValues>({
    resolver: zodResolver(routePanelSchema),
    defaultValues: {
      name: route.name,
      subject: route.subject,
      sequenceNumber: route.sequenceNumber,
    },
  });

  useEffect(() => {
    reset({
      name: route.name,
      subject: route.subject,
      sequenceNumber: route.sequenceNumber,
    });
  }, [route.crmId, reset]);

  useEffect(() => {
    if (!process?.recordEntity) return;
    const loadMeta = async () => {
      const entities = await adapter.getEntities();
      const entity = entities.find((e) => e.logicalName === process.recordEntity);
      if (entity) setObjectTypeCode(entity.objectTypeCode);
    };

    try {
      const xrm = (window as Window & { Xrm?: typeof Xrm }).Xrm;
      if (xrm) setClientUrl(xrm.Utility.getGlobalContext().getClientUrl());
    } catch {
      setClientUrl(window.location.origin);
    }

    loadMeta().catch(() => void 0);
  }, [process?.recordEntity, adapter]);

  function handleFieldChange(field: keyof RouteFormValues, value: string | number): void {
    setRoute({ ...route, [field]: value });
  }

  function handleFetchXmlApply(fetchXml: string): void {
    setRoute({ ...route, filter: fetchXml });
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
        name="subject"
        render={({ field }) => (
          <Field label="Subject">
            <Input
              {...field}
              onChange={(e) => {
                field.onChange(e);
                handleFieldChange('subject', e.target.value);
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

      <Field label="Next Step">
        <Text style={readonlyTextStyle}>
          {nextStep ? `${nextStep.sequenceNo}. ${nextStep.name}` : '— not connected —'}
        </Text>
      </Field>

      <Field label="FetchXML Filter">
        <div style={filterPreviewStyle}>
          {route.filter ? (
            <pre style={filterCodeStyle}>{route.filter}</pre>
          ) : (
            <span style={emptyFilterStyle}>No filter set</span>
          )}
          <Button
            size="small"
            appearance="outline"
            onClick={() => setIsFetchXmlOpen(true)}
          >
            {route.filter ? 'Edit Filter' : 'Add Filter'}
          </Button>
        </div>
      </Field>

      {isFetchXmlOpen && (
        <FetchXmlBuilderDialog
          open={isFetchXmlOpen}
          entityLogicalName={process?.recordEntity ?? ''}
          objectTypeCode={objectTypeCode}
          clientUrl={clientUrl}
          initialFetchXml={route.filter}
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

const readonlyTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#374151',
  padding: '6px 0',
};

const filterPreviewStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const filterCodeStyle: React.CSSProperties = {
  fontSize: 11,
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  padding: 8,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: 120,
  overflowY: 'auto',
  margin: 0,
};

const emptyFilterStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#9ca3af',
  fontStyle: 'italic',
};
