import { useState } from 'react';
import { WorkflowHooksSection } from './WorkflowHooksSection';
import { RouteConfigDialog } from './RouteConfigDialog';
import { useFetchXmlEntityContext } from '@/hooks/useFetchXmlEntityContext';
import type { RouteDraft } from '@/services/routeDraftValidation';
import { hasRealCondition } from '@/services/routeFilter';
import { OUTCOME_HOOKS, ROUTE_HOOKS, emptyWorkflowHooks } from '@/services/workflowHooks';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowRoute } from '@/types/WorkflowTypes';
import { confirm } from '@/components/ui/ConfirmDialog';

interface OutcomePropertiesPanelProps {
  outcomeId: string | null;
  adapter: ICrmAdapter;
}

export function OutcomePropertiesPanel({ outcomeId, adapter }: OutcomePropertiesPanelProps) {
  const {
    outcomes,
    routes,
    routeOrder,
    steps,
    stepOrder,
    setOutcome,
    addRoute,
    deleteRoute,
    deleteOutcome,
    selectNode,
    clearSelection,
  } = useWorkflowStore((s) => ({
    outcomes: s.outcomes,
    routes: s.routes,
    routeOrder: s.routeOrder,
    steps: s.steps,
    stepOrder: s.stepOrder,
    setOutcome: s.setOutcome,
    addRoute: s.addRoute,
    deleteRoute: s.deleteRoute,
    deleteOutcome: s.deleteOutcome,
    selectNode: s.selectNode,
    clearSelection: s.clearSelection,
  }));

  const [addingRoute, setAddingRoute] = useState(false);
  const fetchXmlContext = useFetchXmlEntityContext(adapter);
  /** Deleting a route removes a Dataverse record, so it goes through the same
   * confirmation the decision delete uses rather than a bespoke pattern. */
  const handleDeleteRoute = (route: WorkflowRoute) => {
    void confirm({
      title: 'Delete route',
      message: `Delete route "${route.name || '(unnamed)'}"? Its condition will be lost.`,
      tone: 'danger',
    }).then((confirmed) => { if (confirmed) deleteRoute(route.crmId); });
  };

  const rawId = outcomeId?.replace('outcome_', '') ?? null;
  const outcome = rawId ? outcomes[rawId] : null;

  if (!outcome) {
    return (
      <div className="panel">
        <div style={panelHeaderStyle}>Decision Properties</div>
        <div style={emptyStyle}>No decision selected</div>
      </div>
    );
  }

  const title = outcome.applyFilter ? 'Decision Properties' : 'Transition Properties';

  const outcomeRoutes: WorkflowRoute[] = (routeOrder[outcome.crmId] ?? [])
    .map((id) => routes[id])
    .filter((r): r is WorkflowRoute => r !== undefined);

  const availableSteps = stepOrder
    .map((id) => steps[id])
    .filter((s) => s !== undefined);

  /** Takes a route the Route Configuration screen has already validated. */
  const handleAddRoute = (draft: RouteDraft) => {
    const routeId = `tmp_${crypto.randomUUID()}`;
    addRoute({
      crmId: routeId,
      name: draft.name.trim(),
      subject: '',
      sequenceNumber: draft.sequenceNumber,
      filter: draft.filter,
      workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
      outcomeId: outcome.crmId,
      nextStepId: draft.nextStepId,
      isDefault: draft.isDefault,
    });
    setAddingRoute(false);
    selectNode(`route_edge_${routeId}`);
  };

  const nextSequence = outcomeRoutes.reduce((m, r) => Math.max(m, r.sequenceNumber), 0) + 1;

  const handleToggleConditional = () => {
    const nextApplyFilter = !outcome.applyFilter;
    setOutcome({ ...outcome, applyFilter: nextApplyFilter });
    // Turning conditional routing on: ensure a first Decision Filter (route)
    // record exists so the decision always has somewhere for its FetchXML —
    // mirrors the CRM form auto-creating one when Apply Filter is set.
    if (nextApplyFilter && outcomeRoutes.length === 0) {
      const routeId = `tmp_${crypto.randomUUID()}`;
      addRoute({
        crmId: routeId,
        name: '',
        subject: '',
        sequenceNumber: 1,
        filter: '',
        workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
        outcomeId: outcome.crmId,
        nextStepId: outcome.nextStepId ?? null,
        isDefault: false,
      });
      selectNode(`route_edge_${routeId}`);
    }
  };

  const handleDelete = () => {
    void confirm({
      title: 'Delete decision',
      message: 'Delete this decision? All route conditions will also be deleted.',
      tone: 'danger',
    }).then((confirmed) => {
      if (!confirmed) return;
      deleteOutcome(outcome.crmId);
      clearSelection();
    });
  };

  return (
    <div className="panel">
      <div style={panelHeaderStyle}>{title}</div>
      <div style={panelBodyStyle}>

        <div style={fieldGroupStyle}>
          <label className="lbl">Name</label>
          <input
            type="text"
            value={outcome.name}
            onChange={(e) => setOutcome({ ...outcome, name: e.target.value })}
            className="fluent-input"
            placeholder="Decision name"
          />
        </div>

        <div style={fieldGroupStyle}>
          <label className="lbl">Concurrent branches</label>
          <button
            type="button"
            role="switch"
            aria-checked={outcome.checkParallelTasks}
            onClick={() => setOutcome({ ...outcome, checkParallelTasks: !outcome.checkParallelTasks })}
            style={{ ...toggleStyle, ...(outcome.checkParallelTasks ? toggleOnStyle : toggleOffStyle) }}
          >
            {outcome.checkParallelTasks
              ? '⧉ Wait — all branches must finish first'
              : 'Off — this step can finish while branches run'}
          </button>
          {!outcome.checkParallelTasks && (
            <button
              type="button"
              role="switch"
              aria-checked={outcome.updateParallelTaskRef}
              onClick={() => setOutcome({ ...outcome, updateParallelTaskRef: !outcome.updateParallelTaskRef })}
              style={{ ...toggleStyle, ...(outcome.updateParallelTaskRef ? toggleOnStyle : toggleOffStyle) }}
            >
              {outcome.updateParallelTaskRef
                ? '↪ Carry open branches to the next step'
                : 'Off — open branches stay where they are'}
            </button>
          )}
        </div>

        <div style={fieldGroupStyle}>
          <label className="lbl">Conditional Routing</label>
          <button
            type="button"
            role="switch"
            aria-checked={outcome.applyFilter}
            onClick={handleToggleConditional}
            style={{ ...toggleStyle, ...(outcome.applyFilter ? toggleOnStyle : toggleOffStyle) }}
          >
            {outcome.applyFilter ? '◈ Active — choose a route' : 'Off — direct transition'}
          </button>
        </div>

        {/* Where this decision leads. With conditional routing on, each route carries its
            own target and this one is not consulted, so showing it would be misleading.
            CWFD-016 B4: this used to be a read-only chip — re-pointing a transition
            meant deleting the decision and drawing it again. */}
        {!outcome.applyFilter && (
          <div style={fieldGroupStyle}>
            <label className="lbl">Next Step</label>
            <select
              className="fluent-select"
              value={outcome.nextStepId ?? '__end__'}
              onChange={(e) =>
                setOutcome({
                  ...outcome,
                  nextStepId: e.target.value === '__end__' ? null : e.target.value,
                })
              }
              aria-label="Where this decision leads"
            >
              <option value="__end__">— End of workflow —</option>
              {stepOrder
                .filter((id) => id !== outcome.stepId)
                .map((id) => steps[id])
                .filter(Boolean)
                .map((candidate) => (
                  <option key={candidate.crmId} value={candidate.crmId}>
                    {candidate.sequenceNo}. {candidate.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {outcome.applyFilter && (
          <>
            <div style={dividerStyle} />
            <div className="panel-section">
              Routes
              <span style={countBadgeStyle}>{outcomeRoutes.length}</span>
            </div>

            {outcomeRoutes.map((route) => {
              const nextStep = route.nextStepId ? steps[route.nextStepId] : null;
              const isFallback = route.isDefault;
              return (
                <div key={route.crmId} style={buildRouteRowStyle(isFallback)}>
                  <button
                    type="button"
                    style={routeOpenStyle}
                    onClick={() => selectNode(`route_edge_${route.crmId}`)}
                    title="Open this route"
                  >
                    <span style={routeSeqStyle}>{route.sequenceNumber}</span>
                    <div style={routeInfoStyle}>
                      <span style={routeNameStyle}>{route.name || '(unnamed)'}</span>
                      <span style={routeCondStyle}>{describeRouteCondition(route)}</span>
                      <span style={routeNextStyle}>
                        → {nextStep ? `${nextStep.sequenceNo}. ${nextStep.name}` : 'End'}
                      </span>
                    </div>
                    <span style={routeArrowStyle}>›</span>
                  </button>
                  <button
                    type="button"
                    style={routeDeleteStyle()}
                    aria-label={`Delete route ${route.name || 'unnamed'}`}
                    title="Delete this route"
                    onClick={() => handleDeleteRoute(route)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              className="btn sm block"
              onClick={() => setAddingRoute(true)}
            >
              + Add Route
            </button>
          </>
        )}

        {/* Workflow stays last: it is the least-used section and pushing the routing
            configuration below it buried the part people came here to change. */}
        <WorkflowHooksSection
          value={outcome.workflowHooks}
          onChange={(workflowHooks) => setOutcome({ ...outcome, workflowHooks })}
          kinds={OUTCOME_HOOKS}
          adapter={adapter}
          scopeNote="Runs for the task this outcome leads to, in addition to anything set on that step."
        />

        <div style={dividerStyle} />
        <button type="button" className="btn sm block danger" onClick={handleDelete}>
          Delete Decision
        </button>

        {/* Mounted only while open, so every Add Route starts from a clean form rather
            than whatever the previous one was left holding. */}
        {addingRoute && (
          <RouteConfigDialog
            availableSteps={availableSteps}
            suggestedSequence={nextSequence}
            hasExistingFallback={outcomeRoutes.some((r) => r.isDefault)}
            entityLogicalName={fetchXmlContext.entityLogicalName}
            objectTypeCode={fetchXmlContext.objectTypeCode}
            clientUrl={fetchXmlContext.clientUrl}
            onSave={handleAddRoute}
            onDismiss={() => setAddingRoute(false)}
          />
        )}
      </div>
    </div>
  );
}

const panelHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-disabled)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border-strong)',
  flexShrink: 0,
};

const panelBodyStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  overflowY: 'auto',
  // Without this the flex item will not shrink below its content, so overflowY
  // never engages and the panel is clipped instead of scrolling.
  minHeight: 0,
  flex: 1,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const toggleStyle: React.CSSProperties = {
  width: '100%',
  height: 30,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  textAlign: 'left',
  padding: '0 10px',
};

const toggleOnStyle: React.CSSProperties = {
  background: 'var(--primary-tint)',
  color: 'var(--primary)',
  border: '1px solid var(--primary-pressed)',
};

const toggleOffStyle: React.CSSProperties = {
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  border: 'none',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border-strong)',
  margin: '2px 0',
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  borderRadius: 8,
  padding: '0 5px',
  fontWeight: 700,
};

/** What the row says about a route: the fallback, a real condition, or neither. */
function describeRouteCondition(route: WorkflowRoute): string {
  if (route.isDefault) return 'else (fallback)';
  if (!hasRealCondition(route.filter)) return '⚠ No condition set';
  return '✎ Has condition — click to edit';
}

const routeOpenStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
};

function routeDeleteStyle(): React.CSSProperties {
  return {
    flexShrink: 0,
    marginLeft: 6,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    padding: '3px 7px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };
}

function buildRouteRowStyle(isFallback: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '7px 8px',
    background: isFallback ? 'var(--success-bg)' : 'var(--surface)',
    border: `1px solid ${isFallback ? 'var(--success)' : 'var(--border)'}`,
    borderRadius: 5,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  };
}

const routeSeqStyle: React.CSSProperties = {
  minWidth: 18,
  height: 18,
  borderRadius: 3,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: 1,
};

const routeInfoStyle: React.CSSProperties = {
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
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const routeCondStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const routeNextStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-disabled)',
};

const routeArrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  flexShrink: 0,
  lineHeight: 1,
  marginTop: 2,
};








const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
};
