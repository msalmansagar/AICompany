import { useEffect } from 'react';
import { DECISION_TABLE_DOCS_WEBRESOURCE_PATH } from './docRedirect';

/**
 * Right-docked slide-in pane that shows the Decision-table guide web resource in an iframe.
 * Rendered by the app (not the Dynamics side-pane API) so it works the same whether the
 * designer runs inside the model-driven app, as a standalone web resource, or in local dev.
 * The web-resource path is relative, so it resolves against whichever org serves the page.
 */
export function DocsSidePane({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="docs-scrim" onClick={onClose}>
      <aside
        className="docs-pane"
        role="dialog"
        aria-label="Decision table guide"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="docs-pane-head">
          <strong>Decision table guide</strong>
          <button className="docs-pane-close" onClick={onClose} aria-label="Close guide" title="Close">✕</button>
        </header>
        <iframe
          className="docs-pane-frame"
          src={DECISION_TABLE_DOCS_WEBRESOURCE_PATH}
          title="Decision table guide"
        />
      </aside>
    </div>
  );
}
