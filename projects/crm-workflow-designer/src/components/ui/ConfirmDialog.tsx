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
    <div className="dialog-backdrop" role="presentation" onClick={() => settle(false)}>
      <div
        className="dialog"
        style={{ width: 400 }}
        role="dialog"
        aria-modal="true"
        aria-label={request.title ?? 'Please confirm'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>{request.title ?? 'Please confirm'}</h2>
        </div>
        <div className="dialog-body">{request.message}</div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={() => settle(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={isDanger ? 'btn primary danger-fill' : 'btn primary'}
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

