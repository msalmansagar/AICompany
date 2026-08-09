import { useEffect, useSyncExternalStore } from 'react';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

let currentRequest: ConfirmRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Shows a styled, non-blocking confirmation dialog and resolves to the user's
 * choice. Drop-in replacement for window.confirm that never freezes the tab.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  currentRequest?.resolve(false); // supersede any open request
  return new Promise<boolean>((resolve) => {
    currentRequest = { ...options, resolve };
    emit();
  });
}

function settle(confirmed: boolean): void {
  const request = currentRequest;
  if (!request) return;
  currentRequest = null;
  emit();
  request.resolve(confirmed);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mount once at the app root. Renders the active confirmation dialog, if any. */
export function ConfirmDialogHost() {
  const request = useSyncExternalStore(subscribe, () => currentRequest);

  useEffect(() => {
    if (!request) return;
    // Enter is handled natively by the autofocused confirm button; only wire Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request]);

  if (!request) return null;
  const isDanger = request.tone === 'danger';

  return (
    <div style={backdrop} role="presentation" onClick={() => settle(false)}>
      <div style={dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>{request.title ?? 'Please confirm'}</div>
        <div style={messageStyle}>{request.message}</div>
        <div style={actions}>
          <button type="button" style={cancelBtn} onClick={() => settle(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            style={{ ...confirmBtn, ...(isDanger ? dangerBtn : primaryBtn) }}
            onClick={() => settle(true)}
            autoFocus
          >
            {request.confirmLabel ?? (isDanger ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 3000,
  backdropFilter: 'blur(1px)',
};

const dialog: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 10,
  padding: '20px 22px 16px',
  width: 380,
  maxWidth: '90vw',
  boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 8,
};

const messageStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
  marginBottom: 18,
  whiteSpace: 'pre-wrap',
};

const actions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const baseBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid transparent',
};

const cancelBtn: React.CSSProperties = {
  ...baseBtn,
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  color: 'var(--text)',
};

const confirmBtn: React.CSSProperties = { ...baseBtn, color: 'var(--text-on-primary)' };
const primaryBtn: React.CSSProperties = { background: 'var(--primary)' };
const dangerBtn: React.CSSProperties = { background: 'var(--error)' };
