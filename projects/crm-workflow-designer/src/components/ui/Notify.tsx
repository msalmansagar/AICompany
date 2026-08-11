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
    <div className="toast-wrap">
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

  return (
    <div className={TOAST_CLASS[notice.tone]} role="status">
      <span className="dot" aria-hidden="true" />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{notice.message}</span>
      <button type="button" className="close" onClick={() => dismiss(notice.id)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

/** The dot colour carries the tone, so the toast itself stays one surface. */
const TOAST_CLASS: Record<NotifyTone, string> = {
  info: 'toast info',
  success: 'toast',
  error: 'toast error',
};

