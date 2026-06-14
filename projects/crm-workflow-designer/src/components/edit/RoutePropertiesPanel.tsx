import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { FetchXmlBuilderDialog } from '@/components/FetchXmlBuilder/FetchXmlBuilderDialog';
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
  const [clientUrl, setClientUrl] = useState('');

  const route = routes[routeId] ?? null;
  const nextStep = route?.nextStepId ? steps[route.nextStepId] : null;

  useEffect(() => {
    if (!process?.recordEntity) return;
    adapter.getEntities().then((entities) => {
      const entity = entities.find((e) => e.logicalName === process.recordEntity);
      if (entity) setObjectTypeCode(entity.objectTypeCode);
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
      <div style={panelStyle}>
        <div style={headerStyle}>Route Properties</div>
        <div style={emptyStyle}>Route not found</div>
      </div>
    );
  }

  const isFallback = !route.filter?.trim();

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>Route Properties</div>

      <div style={bodyStyle}>
        <Field label="Name">
          <input
            style={inputStyle}
            value={route.name}
            onChange={(e) => setRoute({ ...route, name: e.target.value })}
            placeholder="Route name"
          />
        </Field>

        <Field label="Sequence">
          <input
            style={inputStyle}
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

      {isFetchXmlOpen && (
        <FetchXmlBuilderDialog
          open={isFetchXmlOpen}
          entityLogicalName={process?.recordEntity ?? ''}
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
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  background: '#0f172a',
  borderLeft: '1px solid #1e293b',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  borderBottom: '1px solid #1e293b',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  overflowY: 'auto' as const,
  flex: 1,
};

const fieldGroup: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  height: 30,
  padding: '0 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
};

const readonlyChip: React.CSSProperties = {
  padding: '4px 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#94a3b8',
  fontSize: 12,
};

const fallbackBanner: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  background: '#052e16',
  border: '1px solid #166534',
  borderRadius: 6,
  padding: '8px 10px',
  marginBottom: 6,
};

const fallbackTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#4ade80',
};

const fallbackHint: React.CSSProperties = {
  fontSize: 10,
  color: '#86efac',
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
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '6px 8px',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: 100,
  overflowY: 'auto',
  margin: 0,
  color: '#94a3b8',
};

const clearBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#64748b',
  fontSize: 10,
  padding: '2px 8px',
  cursor: 'pointer',
  textAlign: 'left',
};

const editFilterBtn: React.CSSProperties = {
  height: 28,
  padding: '0 10px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 11,
  cursor: 'pointer',
  textAlign: 'left',
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: '#475569',
  fontStyle: 'italic',
};
