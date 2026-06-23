import { useState, useEffect } from 'react';
import type { WorkflowData, CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';
import { getAssignToLabel } from '../types/ViewTypes';

import type { ICrmAdapter } from '../services/ICrmAdapter';
import {
  resolveRouteFilter,
  type ResolvedRouteFilter,
  type ResolvedCondition,
} from '../services/FetchXmlMetadataResolver';

interface ReadOnlyPropertyPanelProps {
  data: WorkflowData | null;
  selectedId: string | null;
  adapter: ICrmAdapter;
}

type SelectedItem =
  | { type: 'step'; step: CrmStep }
  | { type: 'outcome'; outcome: CrmOutcome }
  | { type: 'gateway'; outcome: CrmOutcome; routes: CrmRoute[] }
  | null;

const ROUTE_EDGE_PREFIXES = ['e_route_', 'e_exec_route_', 'e_tech_route_'];

function resolveSelected(selectedId: string | null, data: WorkflowData | null): SelectedItem {
  if (!selectedId || !data) return null;

  if (selectedId.startsWith('step_')) {
    const step = data.steps.find((s) => s.id === selectedId.slice(5));
    return step ? { type: 'step', step } : null;
  }

  if (selectedId.startsWith('e_back_')) {
    const outcome = data.outcomes.find((o) => o.id === selectedId.slice(7));
    return outcome ? { type: 'outcome', outcome } : null;
  }

  if (selectedId.startsWith('outcome_')) {
    const outcome = data.outcomes.find((o) => o.id === selectedId.slice(8));
    return outcome ? { type: 'outcome', outcome } : null;
  }

  if (selectedId.startsWith('gw_')) {
    const outcomeId = selectedId.slice(3);
    const outcome = data.outcomes.find((o) => o.id === outcomeId);
    if (!outcome) return null;
    const routes = data.routes
      .filter((r) => r.outcomeId === outcomeId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    return { type: 'gateway', outcome, routes };
  }

  for (const prefix of ROUTE_EDGE_PREFIXES) {
    if (selectedId.startsWith(prefix)) {
      const routeId = selectedId.slice(prefix.length);
      const route = data.routes.find((r) => r.id === routeId);
      if (!route) return null;
      const outcome = data.outcomes.find((o) => o.id === route.outcomeId);
      if (!outcome) return null;
      return { type: 'gateway', outcome, routes: [route] };
    }
  }

  return null;
}

export function ReadOnlyPropertyPanel({ data, selectedId, adapter }: ReadOnlyPropertyPanelProps) {
  const selected = resolveSelected(selectedId, data);

  if (!data) {
    return (
      <div style={panelStyle}>
        <div style={emptyState}>
          <p style={emptyTitle}>No workflow loaded</p>
          <p style={emptyHint}>Open a workflow to see its details here.</p>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div style={panelStyle}>
        <ProcessInfo process={data.process} stepCount={data.steps.length} />
        <div style={emptyState}>
          <p style={emptyHint}>Click a step, gateway ◈, or route edge to inspect it.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <ProcessInfo process={data.process} stepCount={data.steps.length} />
      {selected.type === 'step' && <StepDetails step={selected.step} />}
      {selected.type === 'outcome' && <OutcomeDetails outcome={selected.outcome} />}
      {selected.type === 'gateway' && (
        <GatewayDetails outcome={selected.outcome} routes={selected.routes} adapter={adapter} />
      )}
    </div>
  );
}

function ProcessInfo({ process, stepCount }: { process: WorkflowData['process']; stepCount: number }) {
  return (
    <Section title="Process">
      <Field label="Name" value={process.name} />
      <Field label="Steps" value={String(stepCount)} />
      <Field label="Task Entity" value={process.recordEntityName} />
      <Field label="Regarding Field" value={process.regardingFieldName} />
      <Field label="Parent Entity" value={process.parentEntityName} />
    </Section>
  );
}

function StepDetails({ step }: { step: CrmStep }) {
  const assignLabel = getAssignToLabel(step.assignToCode);
  const assigneeName =
    assignLabel === 'Specific User'
      ? step.assignedUserName
      : assignLabel === 'Team'
      ? step.teamName
      : step.roundRobinTeamName;

  return (
    <Section title="Step Properties">
      <Field label="Name" value={step.name} bold />
      <Field label="Sequence No." value={String(step.sequenceNo)} />
      {step.schemaName && <Field label="Schema Name" value={step.schemaName} mono />}
      {step.taskSubject && <Field label="Task Subject" value={step.taskSubject} />}
      {step.taskDescription && <Field label="Task Description" value={step.taskDescription} multiline />}

      <Divider />
      <SectionLabel>Assignment</SectionLabel>
      <Field label="Assign To" value={assignLabel} />
      {assigneeName && (
        <Field
          label={assignLabel === 'Round Robin' ? 'Round Robin Team' : assignLabel}
          value={assigneeName}
        />
      )}
      {step.enableRoundRobin && <Field label="Round Robin" value="Enabled" />}

      <Divider />
      <SectionLabel>Entity Mapping</SectionLabel>
      <Field label="Task Entity" value={step.recordEntityName} />
      <Field label="Regarding Field" value={step.regardingFieldName} />
      <Field label="Parent Entity" value={step.parentEntityName} />
    </Section>
  );
}

function OutcomeDetails({ outcome }: { outcome: CrmOutcome }) {
  return (
    <Section title="Decision Properties">
      <Field label="Name" value={outcome.name} bold />
      <Field label="Sequence No." value={String(outcome.sequenceNumber)} />
      <Field label="Parent Step" value={outcome.stepName} />
      <Field
        label="Next Step"
        value={outcome.nextStepName ?? (outcome.nextStepId ? outcome.nextStepId : '— Terminal')}
      />
      <Field
        label="Apply Filter"
        value={outcome.applyFilter ? 'Yes — conditional routing active' : 'No'}
      />
    </Section>
  );
}

function GatewayDetails({
  outcome,
  routes,
  adapter,
}: {
  outcome: CrmOutcome;
  routes: CrmRoute[];
  adapter: ICrmAdapter;
}) {
  return (
    <Section title="Filter Gateway">
      <Field label="Outcome" value={outcome.name} bold />
      <Field label="Parent Step" value={outcome.stepName} />
      <Divider />
      <SectionLabel>Routes ({routes.length})</SectionLabel>
      <div style={routeListStyle}>
        {routes.map((route, index) => (
          <RouteEntry key={route.id} route={route} index={index} adapter={adapter} />
        ))}
      </div>
    </Section>
  );
}

type ResolveState = 'loading' | ResolvedRouteFilter | null;

function RouteEntry({
  route,
  index,
  adapter,
}: {
  route: CrmRoute;
  index: number;
  adapter: ICrmAdapter;
}) {
  const isFallback = !route.filter?.trim();
  const [resolveState, setResolveState] = useState<ResolveState>(isFallback ? null : 'loading');

  useEffect(() => {
    if (isFallback) return;
    resolveRouteFilter(route.filter, adapter)
      .then((result) => setResolveState(result))
      .catch(() => setResolveState(null));
  }, [route.filter, adapter, isFallback]);

  return (
    <div style={routeEntryStyle}>
      <div style={buildRouteHeaderStyle(isFallback)}>
        <span style={buildIndexBadgeStyle(isFallback)}>{index + 1}</span>
        <div style={routeTextBlock}>
          <span style={routeNameStyle}>{route.name || '(unnamed)'}</span>
          {isFallback && <span style={buildShortLabelStyle(true)}>else (fallback path)</span>}
        </div>
      </div>

      {!isFallback && (
        <div style={expandedBodyStyle}>
          {resolveState === 'loading' && (
            <span style={resolvingLabelStyle}>Resolving…</span>
          )}
          {resolveState !== 'loading' && resolveState !== null && (
            <ResolvedConditionList conditions={resolveState.conditions} />
          )}
          {resolveState === null && !isFallback && (
            <span style={resolvingLabelStyle}>Could not resolve conditions.</span>
          )}
        </div>
      )}
    </div>
  );
}

function ResolvedConditionList({ conditions }: { conditions: ResolvedCondition[] }) {
  return (
    <div style={condListStyle}>
      {conditions.map((c, i) => (
        <div key={i} style={condRowStyle}>
          <span style={condFieldStyle}>{c.fieldLabel}</span>
          <span style={condOpStyle}>{c.operatorLabel}</span>
          {c.valueLabel !== null && <span style={condValStyle}>{c.valueLabel}</span>}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionTitle}>{title}</div>
      <div style={sectionBody}>{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={subLabel}>{children}</div>;
}

function Divider() {
  return <div style={dividerStyle} />;
}

function Field({
  label,
  value,
  bold,
  mono,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  bold?: boolean;
  mono?: boolean;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div style={fieldRow}>
      <span style={fieldLabel}>{label}</span>
      <span
        style={{
          ...fieldValue,
          fontWeight: bold ? 600 : 400,
          fontFamily: mono ? 'monospace' : 'inherit',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  maxWidth: 280,
  background: '#fafafa',
  borderLeft: '1px solid #e2e8f0',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
};

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid #e2e8f0',
  padding: '12px 14px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  marginBottom: 8,
};

const sectionBody: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const subLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#475569',
  marginTop: 2,
  marginBottom: 2,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const fieldRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
  fontWeight: 500,
};

const fieldValue: React.CSSProperties = {
  fontSize: 12,
  color: '#1e293b',
  wordBreak: 'break-word',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #f1f5f9',
  margin: '6px 0',
};

const emptyState: React.CSSProperties = {
  padding: '16px 14px',
};

const emptyTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  margin: '0 0 4px',
};

const emptyHint: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  margin: 0,
};

const routeListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const routeEntryStyle: React.CSSProperties = {
  borderRadius: 6,
  border: '1px solid #e2e8f0',
  overflow: 'hidden',
};

function buildRouteHeaderStyle(isFallback: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '7px 8px',
    background: isFallback ? '#f0fdf4' : '#fffbeb',
    border: 'none',
    cursor: isFallback ? 'default' : 'pointer',
    textAlign: 'left',
  };
}

function buildIndexBadgeStyle(isFallback: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: isFallback ? '#16a34a' : '#d97706',
    color: '#fff',
    fontSize: 9,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  };
}

const routeTextBlock: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const routeNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#1e293b',
  wordBreak: 'break-word',
};

function buildShortLabelStyle(isFallback: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    color: isFallback ? '#166534' : '#92400e',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  };
}


const expandedBodyStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: '#f8fafc',
  borderTop: '1px solid #e2e8f0',
};

const resolvingLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  fontStyle: 'italic',
};

const condListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
};

const condRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: 4,
};

const condFieldStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#1e293b',
};

const condOpStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  fontWeight: 500,
};

const condValStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#2563eb',
  background: '#eff6ff',
  borderRadius: 3,
  padding: '0 4px',
};
