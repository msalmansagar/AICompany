import { useWorkflowStore } from '@/store/workflowStore';
import { ProcessPanel } from './ProcessPanel';
import { StepPanel } from './StepPanel';
import { OutcomePanel } from './OutcomePanel';
import { RoutePanel } from './RoutePanel';

export function PropertiesPanel() {
  const { selectedId, process, steps, outcomes, routes } = useWorkflowStore((s) => ({
    selectedId: s.selectedId,
    process: s.process,
    steps: s.steps,
    outcomes: s.outcomes,
    routes: s.routes,
  }));

  function resolveSelection(): React.ReactNode {
    if (!selectedId) {
      return <EmptyState />;
    }

    // Check if it's the process
    if (selectedId === 'process' && process) {
      return <ProcessPanel process={process} />;
    }

    // Check steps
    const step = steps[selectedId];
    if (step) return <StepPanel step={step} />;

    // Check outcomes
    const outcome = outcomes[selectedId];
    if (outcome) return <OutcomePanel outcome={outcome} />;

    // Check routes
    const route = routes[selectedId];
    if (route) return <RoutePanel route={route} />;

    return <EmptyState />;
  }

  return (
    <div style={panelStyle} role="complementary" aria-label="Properties Panel">
      <div style={headerStyle}>
        <span style={headerTitleStyle}>Properties</span>
      </div>
      <div style={bodyStyle}>{resolveSelection()}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={emptyStateStyle}>
      <div style={emptyIconStyle}>
        <span aria-hidden="true">&#8505;</span>
      </div>
      <p style={emptyTitleStyle}>No Selection</p>
      <p style={emptyHintStyle}>
        Click a step, outcome, or route on the canvas to view and edit its properties.
      </p>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  background: 'var(--surface)',
  borderLeft: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface-alt)',
  flexShrink: 0,
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 16,
};

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 8,
  color: 'var(--text-disabled)',
  textAlign: 'center',
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: 32,
};

const emptyTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  margin: 0,
};

const emptyHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-disabled)',
  maxWidth: 220,
  margin: 0,
};
