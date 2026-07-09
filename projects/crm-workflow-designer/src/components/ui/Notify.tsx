import { useEffect, useSyncExternalStore } from 'react';

export type NotifyTone = 'info' | 'success' | 'error';

interface Notice {
  id: number;
  message: string;
  tone: NotifyTone;
}

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function dismiss(id: number): void {
  notices = notices.filter((n) => n.id !== id);
  emit();
}

/**
 * Shows a transient toast. Drop-in replacement for window.alert that does not
 * block the page. Auto-dismisses after a few seconds.
 */
export function notify(message: string, tone: NotifyTone = 'info'): void {
  const id = nextId++;
  notices = [...notices, { id, message, tone }];
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mount once at the app root. Renders the stack of active toasts. */
export function NotifyHost() {
  const items = useSyncExternalStore(subscribe, () => notices);
  if (items.length === 0) return null;
  return (
    <div style={stack}>
      {items.map((notice) => (
        <ToastItem key={notice.id} notice={notice} />
      ))}
    </div>
  );
}

function ToastItem({ notice }: { notice: Notice }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(notice.id), 5000);
    return () => clearTimeout(timer);
  }, [notice.id]);

  const tone = TONES[notice.tone];
  return (
    <div style={{ ...toast, background: tone.bg, border: `1px solid ${tone.border}`, color: tone.fg }}>
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{tone.icon}</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{notice.message}</span>
      <button type="button" style={closeBtn} onClick={() => dismiss(notice.id)} aria-label="Dismiss">✕</button>
    </div>
  );
}

const TONES: Record<NotifyTone, { bg: string; border: string; fg: string; icon: string }> = {
  info:    { bg: '#eff6ff', border: '#bfdbfe', fg: '#1e40af', icon: 'ℹ' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#166534', icon: '✓' },
  error:   { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b', icon: '✕' },
};

const stack: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 2500,
  alignItems: 'center',
};

const toast: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 16px',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  maxWidth: 480,
  fontSize: 13,
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  opacity: 0.6,
  flexShrink: 0,
  padding: 0,
};
