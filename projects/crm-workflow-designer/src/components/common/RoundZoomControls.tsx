import { Panel, useReactFlow } from '@xyflow/react';

/**
 * The org chart's bottom-right camera cluster: three round buttons —
 * zoom in, zoom out, fit — floating over the canvas.
 */
export function RoundZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <Panel position="bottom-right" style={clusterStyle}>
      <button
        type="button"
        style={roundButton}
        title="Zoom in"
        aria-label="Zoom in"
        onClick={() => void zoomIn({ duration: 200 })}
      >
        <MagnifierIcon sign="+" />
      </button>
      <button
        type="button"
        style={roundButton}
        title="Zoom out"
        aria-label="Zoom out"
        onClick={() => void zoomOut({ duration: 200 })}
      >
        <MagnifierIcon sign="−" />
      </button>
      <button
        type="button"
        style={roundButton}
        title="Fit the whole chart"
        aria-label="Fit the whole chart"
        onClick={() => void fitView({ padding: 0.2, maxZoom: 1.1, duration: 300 })}
      >
        <FitIcon />
      </button>
    </Panel>
  );
}

function MagnifierIcon({ sign }: { sign: '+' | '−' }) {
  return (
    <span style={iconWrap} aria-hidden>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="7" cy="7" r="4.5" />
        <line x1="10.4" y1="10.4" x2="14" y2="14" strokeLinecap="round" />
        {sign === '+' ? (
          <>
            <line x1="7" y1="5.2" x2="7" y2="8.8" strokeLinecap="round" />
            <line x1="5.2" y1="7" x2="8.8" y2="7" strokeLinecap="round" />
          </>
        ) : (
          <line x1="5.2" y1="7" x2="8.8" y2="7" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

function FitIcon() {
  return (
    <span style={iconWrap} aria-hidden>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5" />
        <path d="M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5" />
        <path d="M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11" />
        <path d="M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11" />
        <rect x="5.5" y="5.5" width="5" height="5" rx="0.8" />
      </svg>
    </span>
  );
}

const clusterStyle: React.CSSProperties = {
  margin: 18,
  display: 'flex',
  gap: 10,
};

const roundButton: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
  color: 'var(--text)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

const iconWrap: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};
