interface DemoHUDProps {
  narration: string;
  beatIndex: number;
  beatCount: number;
  onStop: () => void;
}

/**
 * The narration bar for demo playback — the FlowOn walkthrough's "status bar
 * narrates every action" pattern, on our own canvas. Same placement and
 * z-band as the auto-simulation HUD.
 */
export function DemoHUD({ narration, beatIndex, beatCount, onStop }: DemoHUDProps) {
  return (
    <div style={hudStyle}>
      <span style={counterStyle}>Demo · {beatIndex + 1}/{beatCount}</span>
      <span className="cmd-sep" />
      <span style={narrationStyle}>{narration}</span>
      <button type="button" onClick={onStop} className="btn sm danger" title="Stop the demo" style={stopStyle}>
        ■ Stop
      </button>
    </div>
  );
}

const hudStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 16px',
  background: 'var(--surface)',
  borderTop: '1px solid var(--border)',
  zIndex: 100,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
};

const counterStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--primary)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const narrationStyle: React.CSSProperties = {
  fontSize: 12,
  fontStyle: 'italic',
  color: 'var(--text-secondary)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const stopStyle: React.CSSProperties = { flexShrink: 0 };
