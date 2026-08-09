import { useEffect } from 'react';
import { useWorkflowStore } from '../store/workflowStore';

export function ValidationToast() {
  const { toastMessage, toastType, clearToast } = useWorkflowStore((s) => ({
    toastMessage: s.toastMessage,
    toastType: s.toastType,
    clearToast: s.clearToast,
  }));

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(clearToast, 5000);
    return () => clearTimeout(timer);
  }, [toastMessage, clearToast]);

  if (!toastMessage) return null;

  const isError = toastType === 'error';

  return (
    <div style={{ ...toast, ...(isError ? errorStyle : successStyle) }}>
      <span style={icon}>{isError ? '✕' : '✓'}</span>
      <span style={msg}>{toastMessage}</span>
      <button style={closeBtn} onClick={clearToast}>✕</button>
    </div>
  );
}

const toast: React.CSSProperties = {
  position: 'absolute',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 16px',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  zIndex: 100,
  maxWidth: 480,
  fontSize: 13,
};

const errorStyle: React.CSSProperties = { background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)' };
const successStyle: React.CSSProperties = { background: 'var(--success-bg)', border: '1px solid var(--success)', color: 'var(--success)' };
const icon: React.CSSProperties = { fontWeight: 700, flexShrink: 0, marginTop: 1 };
const msg: React.CSSProperties = { flex: 1, lineHeight: 1.4 };
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
  opacity: 0.6, flexShrink: 0, padding: 0, marginTop: 1,
};
