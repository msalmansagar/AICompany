import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { FetchXmlBuilderDialog } from '@/components/FetchXmlBuilder/FetchXmlBuilderDialog';
import { WorkflowHooksSection } from './WorkflowHooksSection';
import { ROUTE_HOOKS } from '@/services/workflowHooks';
import type { ICrmAdapter } from '@/services/ICrmAdapter';

interface RoutePropertiesPanelProps {
  routeId: string;
  adapter: ICrmAdapter;
}

export function RoutePropertiesPanel({ routeId, adapter }: RoutePropertiesPanelProps) {
  const { routes, steps, process, setRoute } = useWorkflowStore((s) => ({
    routes: s.routes,
    steps: s.steps,
    process: s.process,
    setRoute: s.setRoute,
  }));

  const [isFetchXmlOpen, setIsFetchXmlOpen] = useState(false);
  const [objectTypeCode, setObjectTypeCode] = useState(0);
  const [entityLogicalName, setEntityLogicalName] = useState('');
  const [clientUrl, setClientUrl] = useState('');

  const route = routes[routeId] ?? null;
  const nextStep = route?.nextStepId ? steps[route.nextStepId] : null;

  useEffect(() => {
    if (!process?.recordEntity) return;
    // process.recordEntity is a lookup GUID into the autonumber system-entities
    // table; that record carries the target entity's objectTypeCode + logical name.
    const recordEntityId = process.recordEntity.replace(/[{}]/g, '').toLowerCase();
    adapter.getAutoNumberEntities().then((entities) => {
      const entity = entities.find((e) => e.id === recordEntityId);
      if (entity) {
        setObjectTypeCode(entity.objectTypeCode);
        setEntityLogicalName(entity.logicalName);
      }
    }).catch(() => void 0);

    try {
      const xrm = (window as Window & { Xrm?: typeof Xrm }).Xrm;
      setClientUrl(xrm ? xrm.Utility.getGlobalContext().getClientUrl() : window.location.origin);
    } catch {
      setClientUrl(window.location.origin);
    }
  }, [process?.recordEntity, adapter]);

  if (!route) {
    return (
      <div className="panel">
        <div className="panel-head"><h3>Route Properties</h3></div>
        <div style={emptyStyle}>Route not found</div>
      </div>
    );
  }

  const isFallback = !route.filter?.trim();

  return (
    <div className="panel">
      <div className="panel-head"><h3>Route Properties</h3></div>

      <div className="panel-body">
        <Field label="Name">
          <input
            className="fluent-input"
            value={route.name}
            onChange={(e) => setRoute({ ...route, name: e.target.value })}
            placeholder="Route name"
          />
        </Field>

        <Field label="Sequence">
          <input
            className="fluent-input"
            type="number"
            value={route.sequenceNumber}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) setRoute({ ...route, sequenceNumber: n });
            }}
            min={1}
          />
        </Field>

        <Field label="Next Step">
          <div style={readonlyChip}>
            {nextStep ? `${nextStep.sequenceNo}. ${nextStep.name}` : '— End node —'}
          </div>
        </Field>

        <Field label="Condition (FetchXML)">
          {isFallback ? (
            <div style={fallbackBanner}>
              <span style={{ fontSize: 14 }}>⊘</span>
              <div>
                <div style={fallbackTitle}>Fallback route</div>
                <div style={fallbackHint}>
                  No condition — fires when no earlier route matches.
                  Keep this as the highest sequence number.
                </div>
              </div>
            </div>
          ) : (
            <div style={filterBlock}>
              <pre style={filterCode}>{route.filter}</pre>
              <button
                type="button"
                style={clearBtn}
                onClick={() => setRoute({ ...route, filter: '' })}
                title="Remove condition — makes this route the fallback"
              >
                ✕ Clear (make fallback)
              </button>
            </div>
          )}
          <button
            type="button"
            style={editFilterBtn}
            onClick={() => setIsFetchXmlOpen(true)}
          >
            {isFallback ? '+ Add Condition' : '✎ Edit Condition'}
          </button>
        </Field>
      </div>


      <WorkflowHooksSection

        value={route.workflowHooks}

        onChange={(workflowHooks) => setRoute({ ...route, workflowHooks })}

        kinds={ROUTE_HOOKS}

        adapter={adapter}

        scopeNote="Runs for the task this route leads to. The step and the process may add their own, and the engine runs all of them."

      />


      {isFetchXmlOpen && (
        <FetchXmlBuilderDialog
          open={isFetchXmlOpen}
          entityLogicalName={entityLogicalName}
          objectTypeCode={objectTypeCode}
          clientUrl={clientUrl}
          initialFetchXml={route.filter}
          onApply={(xml) => { setRoute({ ...route, filter: xml }); setIsFetchXmlOpen(false); }}
          onDismiss={() => setIsFetchXmlOpen(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={fieldGroup}>
      <div className="lbl">{label}</div>
      {children}
    </div>
  );
}

const fieldGroup: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const readonlyChip: React.CSSProperties = {
  padding: '4px 8px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-disabled)',
  fontSize: 12,
};

const fallbackBanner: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  background: 'var(--success-bg)',
  border: '1px solid var(--success)',
  borderRadius: 6,
  padding: '8px 10px',
  marginBottom: 6,
};

const fallbackTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--success)',
};

const fallbackHint: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--success)',
  marginTop: 2,
  lineHeight: 1.5,
};

const filterBlock: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 6,
};

const filterCode: React.CSSProperties = {
  fontSize: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '6px 8px',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: 100,
  overflowY: 'auto',
  margin: 0,
  color: 'var(--text-disabled)',
};

const clearBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  fontSize: 10,
  padding: '2px 8px',
  cursor: 'pointer',
  textAlign: 'left',
};

const editFilterBtn: React.CSSProperties = {
  height: 28,
  padding: '0 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 11,
  cursor: 'pointer',
  textAlign: 'left',
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
};
