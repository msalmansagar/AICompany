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
      <div className="panel">
        <div className="empty-state">
          <p style={emptyTitle}>No workflow loaded</p>
          <p className="hint-inline">Open a workflow to see its details here.</p>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="panel">
        <div className="panel-body">
          <ProcessInfo process={data.process} stepCount={data.steps.length} />
          <div className="empty-state">
            <p className="hint-inline">Click a step, gateway ◈, or route edge to inspect it.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-body">
        <ProcessInfo process={data.process} stepCount={data.steps.length} />
        {selected.type === 'step' && <StepDetails step={selected.step} />}
        {selected.type === 'outcome' && <OutcomeDetails outcome={selected.outcome} />}
        {selected.type === 'gateway' && (
          <GatewayDetails outcome={selected.outcome} routes={selected.routes} adapter={adapter} />
        )}
      </div>
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
    <div className="ro-section">
      <div className="panel-section">{title}</div>
      <div className="ro-fields">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="hint-inline">{children}</div>;
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
    <div className="ro-field">
      <span className="k">{label}</span>
      <span
        className="v"
        style={{
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

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  margin: '6px 0',
};

const emptyTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  margin: '0 0 4px',
};

const routeListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const routeEntryStyle: React.CSSProperties = {
  borderRadius: 6,
  border: '1px solid var(--border)',
  overflow: 'hidden',
};

function buildRouteHeaderStyle(isFallback: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '7px 8px',
    background: isFallback ? 'var(--success-bg)' : 'var(--warning-bg)',
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
    background: isFallback ? 'var(--success)' : 'var(--warning)',
    color: 'var(--text-on-primary)',
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
  color: 'var(--text)',
  wordBreak: 'break-word',
};

function buildShortLabelStyle(isFallback: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    color: isFallback ? 'var(--success)' : 'var(--warning)',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  };
}


const expandedBodyStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--surface-alt)',
  borderTop: '1px solid var(--border)',
};

const resolvingLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-disabled)',
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
  color: 'var(--text)',
};

const condOpStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

const condValStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--primary)',
  background: 'var(--primary-tint-2)',
  borderRadius: 3,
  padding: '0 4px',
};
