import { useState, useEffect } from 'react';
import { hasRealCondition } from '@/services/routeFilter';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { resolveRouteFilter } from '@/services/FetchXmlMetadataResolver';

interface SimulationPanelProps {
  adapter: ICrmAdapter;
  onExit: () => void;
}

export function SimulationPanel({ adapter, onExit }: SimulationPanelProps) {
  const {
    steps,
    outcomes,
    routes,
    routeOrder,
    outcomeOrder,
    simCurrentStepId,
    simHistory,
    simRoutePickerOutcomeId,
    simTakeOutcome,
    simOpenRoutePicker,
    simCloseRoutePicker,
    simTakeRoute,
    simStepBack,
    startSimulation,
  } = useWorkflowStore((s) => ({
    steps: s.steps,
    outcomes: s.outcomes,
    routes: s.routes,
    routeOrder: s.routeOrder,
    outcomeOrder: s.outcomeOrder,
    simCurrentStepId: s.simCurrentStepId,
    simHistory: s.simHistory,
    simRoutePickerOutcomeId: s.simRoutePickerOutcomeId,
    simTakeOutcome: s.simTakeOutcome,
    simOpenRoutePicker: s.simOpenRoutePicker,
    simCloseRoutePicker: s.simCloseRoutePicker,
    simTakeRoute: s.simTakeRoute,
    simStepBack: s.simStepBack,
    startSimulation: s.startSimulation,
  }));

  const currentStep = simCurrentStepId ? steps[simCurrentStepId] : null;
  const isComplete = simCurrentStepId === null && simHistory.length > 0;
  const canStepBack = simHistory.length > 0;

  const availableOutcomes = simCurrentStepId
    ? (outcomeOrder[simCurrentStepId] ?? [])
        .map((id) => outcomes[id])
        .filter((o): o is WorkflowOutcome => o !== undefined)
    : [];

  const pathLabel = buildPathLabel(simHistory, steps);

  const pickerOutcome = simRoutePickerOutcomeId ? outcomes[simRoutePickerOutcomeId] : null;
  const pickerRoutes = simRoutePickerOutcomeId
    ? (routeOrder[simRoutePickerOutcomeId] ?? [])
        .map((id) => routes[id])
        .filter((r): r is WorkflowRoute => r !== undefined)
    : [];

  const handleOutcomeClick = (outcome: WorkflowOutcome) => {
    if (outcome.applyFilter) {
      const outcomeRoutes = (routeOrder[outcome.crmId] ?? [])
        .map((id) => routes[id])
        .filter((r): r is WorkflowRoute => r !== undefined);

      if (outcomeRoutes.length > 0) {
        simOpenRoutePicker(outcome.crmId);
        return;
      }
    }
    simTakeOutcome(outcome.crmId);
  };

  return (
    <>
      {simRoutePickerOutcomeId && pickerOutcome && (
        <RoutePickerDialog
          outcomeName={pickerOutcome.name}
          routes={pickerRoutes}
          outcomeId={simRoutePickerOutcomeId}
          steps={steps}
          adapter={adapter}
          onPickRoute={simTakeRoute}
          onClose={simCloseRoutePicker}
        />
      )}

      <div className="panel">
        <div style={topRowStyle}>
          <span style={simBadgeStyle}>⏵ SIMULATION</span>

          {isComplete ? (
            <span style={completeLabelStyle}>✓ Process Complete</span>
          ) : (
            <span style={stepTitleStyle} title={currentStep?.name}>
              {currentStep?.name ?? '—'}
            </span>
          )}

          {currentStep && (
            <span style={assigneeChipStyle}>{resolveAssigneeLabel(currentStep)}</span>
          )}

          <div style={flexSpacer} />

          {pathLabel && <span style={pathLabelStyle}>{pathLabel}</span>}

          <button type="button" onClick={onExit} style={exitBtnStyle} title="Exit simulation">
            Exit ✕
          </button>
        </div>

        <div style={actionRowStyle}>
          <NavButton label="← Back" onClick={simStepBack} disabled={!canStepBack} />
          <NavButton label="↺ Reset" onClick={startSimulation} disabled={false} />

          <div style={actionDividerStyle} />

          {isComplete && (
            <span style={completeNoteStyle}>No more steps in this path.</span>
          )}

          {!isComplete && availableOutcomes.length === 0 && (
            <span style={completeNoteStyle}>This step has no outgoing outcomes. Add outcomes to continue.</span>
          )}

          {availableOutcomes.map((outcome) => (
            <OutcomeButton
              key={outcome.crmId}
              outcome={outcome}
              onClick={handleOutcomeClick}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function RoutePickerDialog({
  outcomeName,
  routes,
  outcomeId,
  steps,
  adapter,
  onPickRoute,
  onClose,
}: {
  outcomeName: string;
  routes: WorkflowRoute[];
  outcomeId: string;
  steps: Record<string, { name: string }>;
  adapter: ICrmAdapter;
  onPickRoute: (outcomeId: string, nextStepId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div style={pickerOverlayStyle} onClick={onClose}>
      <div style={pickerDialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={pickerHeaderStyle}>
          <div>
            <div style={pickerTitleStyle}>Choose Route</div>
            <div style={pickerSubtitleStyle}>Outcome: {outcomeName}</div>
          </div>
          <button type="button" onClick={onClose} style={pickerCloseBtnStyle}>✕</button>
        </div>

        <div style={pickerBodyStyle}>
          {routes.length === 0 ? (
            <div style={pickerEmptyStyle}>No routes configured for this outcome.</div>
          ) : (
            routes.map((route) => {
              const isFallback = route.isDefault;
              const nextStep = route.nextStepId ? steps[route.nextStepId] : null;

              return (
                <button
                  key={route.crmId}
                  type="button"
                  style={buildRouteOptionStyle(isFallback)}
                  onClick={() => onPickRoute(outcomeId, route.nextStepId)}
                >
                  <div style={routeOptionLeftStyle}>
                    <span style={routeOptionSeqStyle}>{route.sequenceNumber}</span>
                    <div style={routeOptionInfoStyle}>
                      {route.name && <span style={routeOptionNameStyle}>{route.name}</span>}
                      <RouteConditionLabel filter={route.filter} adapter={adapter} />
                    </div>
                  </div>
                  <div style={routeOptionRightStyle}>
                    <span style={routeOptionNextStyle}>
                      → {nextStep ? nextStep.name : 'END'}
                    </span>
                    <span style={buildRouteBadgeStyle(isFallback)}>
                      {isFallback ? 'ELSE' : 'IF'}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function RouteConditionLabel({ filter, adapter }: { filter: string; adapter: ICrmAdapter }) {
  const isFallback = !hasRealCondition(filter);
  const [label, setLabel] = useState<string>(isFallback ? 'else (fallback)' : 'Resolving…');

  useEffect(() => {
    if (isFallback) return;
    resolveRouteFilter(filter, adapter)
      .then((result) => {
        if (!result || result.conditions.length === 0) {
          setLabel('FetchXML condition');
          return;
        }
        const parts = result.conditions
          .map((c) =>
            c.valueLabel !== null
              ? `${c.fieldLabel} ${c.operatorLabel} ${c.valueLabel}`
              : `${c.fieldLabel} ${c.operatorLabel}`
          )
          .join(', ');
        setLabel(parts);
      })
      .catch(() => setLabel('FetchXML condition'));
  }, [filter, adapter, isFallback]);

  return <span style={routeOptionCondStyle}>{label}</span>;
}

function OutcomeButton({
  outcome,
  onClick,
}: {
  outcome: WorkflowOutcome;
  onClick: (o: WorkflowOutcome) => void;
}) {
  const isConditional = outcome.applyFilter;
  return (
    <button
      type="button"
      onClick={() => onClick(outcome)}
      style={isConditional ? conditionalOutcomeBtnStyle : outcomeBtnStyle}
      title={isConditional ? `${outcome.name} (conditional — choose route)` : `Take outcome: ${outcome.name}`}
    >
      {isConditional ? `◈ ${outcome.name}` : `${outcome.name} ▶`}
    </button>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...navBtnStyle, ...(disabled ? navBtnDisabledStyle : {}) }}
    >
      {label}
    </button>
  );
}

function buildPathLabel(
  history: Array<{ stepId: string }>,
  steps: ReturnType<typeof useWorkflowStore.getState>['steps']
): string {
  if (history.length === 0) return '';
  const names = history.map((h) => steps[h.stepId]?.name ?? '?');
  return `Start → ${names.join(' → ')}`;
}

function resolveAssigneeLabel(
  step: ReturnType<typeof useWorkflowStore.getState>['steps'][string]
): string {
  if (!step) return '';
  const name =
    step.assignTo === 'user'
      ? step.assignedUserName
      : step.assignTo === 'team'
        ? step.teamName
        : step.roundRobinTeamName;
  const label = step.assignTo === 'roundRobin' ? 'Round Robin' : step.assignTo === 'team' ? 'Team' : 'User';
  return name ? `${label}: ${name}` : label;
}

// --- Styles ---

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 16px 4px',
  borderBottom: '1px solid var(--border-strong)',
  minHeight: 36,
  flexWrap: 'wrap',
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px 10px',
  flexWrap: 'wrap',
};

const simBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: 'var(--primary)',
  background: 'rgba(37,99,235,0.18)',
  border: '1px solid rgba(37,99,235,0.35)',
  borderRadius: 4,
  padding: '2px 8px',
  flexShrink: 0,
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 240,
};

const completeLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--success)' };

const assigneeChipStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-disabled)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 8px',
  flexShrink: 0,
};

const flexSpacer: React.CSSProperties = { flex: 1, minWidth: 0 };

const pathLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 320,
};

const exitBtnStyle: React.CSSProperties = {
  height: 26,
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-disabled)',
  cursor: 'pointer',
  flexShrink: 0,
};

const navBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  flexShrink: 0,
};

const navBtnDisabledStyle: React.CSSProperties = { opacity: 0.38, cursor: 'not-allowed' };

const actionDividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'var(--surface-alt)',
  flexShrink: 0,
};

const outcomeBtnStyle: React.CSSProperties = {
  height: 30,
  padding: '0 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 4,
  border: '1.5px solid var(--primary)',
  background: 'rgba(37,99,235,0.12)',
  color: 'var(--primary)',
  cursor: 'pointer',
  flexShrink: 0,
};

const conditionalOutcomeBtnStyle: React.CSSProperties = {
  height: 30,
  padding: '0 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 4,
  border: '1.5px solid var(--warning)',
  background: 'rgba(217,119,6,0.12)',
  color: 'var(--warning)',
  cursor: 'pointer',
  flexShrink: 0,
};

const completeNoteStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' };

// Route picker dialog styles

const pickerOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const pickerDialogStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--primary-pressed)',
  borderRadius: 10,
  width: 520,
  maxWidth: '92vw',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  overflow: 'hidden',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const pickerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '14px 16px 10px',
  borderBottom: '1px solid var(--border-strong)',
};

const pickerTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 2,
};

const pickerSubtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
};

const pickerCloseBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 12,
  flexShrink: 0,
};

const pickerBodyStyle: React.CSSProperties = {
  padding: '10px 12px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxHeight: 320,
  overflowY: 'auto',
  // Without this the flex item will not shrink below its content, so overflowY
  // never engages and the panel is clipped instead of scrolling.
  minHeight: 0,
};

const pickerEmptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
  padding: '12px 4px',
};

function buildRouteOptionStyle(isFallback: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 12px',
    background: isFallback ? 'var(--success-bg)' : 'var(--surface)',
    border: `1px solid ${isFallback ? 'var(--success)' : 'var(--border)'}`,
    borderRadius: 6,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.1s',
  };
}

const routeOptionLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  flex: 1,
  minWidth: 0,
};

const routeOptionSeqStyle: React.CSSProperties = {
  minWidth: 20,
  height: 20,
  borderRadius: 3,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const routeOptionInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const routeOptionNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const routeOptionCondStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-disabled)',
  wordBreak: 'break-word',
};

const routeOptionRightStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 4,
  flexShrink: 0,
};

const routeOptionNextStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-disabled)',
  whiteSpace: 'nowrap',
};

function buildRouteBadgeStyle(isFallback: boolean): React.CSSProperties {
  return {
    fontSize: 9,
    fontWeight: 700,
    color: isFallback ? 'var(--success)' : 'var(--warning)',
    background: isFallback ? 'var(--success-bg)' : 'var(--warning-bg)',
    border: `1px solid ${isFallback ? 'var(--success)' : 'var(--warning)'}`,
    borderRadius: 3,
    padding: '1px 5px',
    letterSpacing: '0.04em',
  };
}
