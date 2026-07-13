import { useEffect } from 'react';
import type { DocGuide } from './docRedirect';

/**
 * Right-docked slide-in pane that shows a guide web resource in an iframe — the same-window
 * side-pane experience, rendered by the app so it works whether the designer runs inside the
 * model-driven app, as a standalone web resource, or in local dev. The guide's web-resource
 * path is relative, so it resolves against whichever org serves the page.
 */
export function DocsSidePane({ guide, onClose }: { guide: DocGuide; onClose: () => void }) {
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
        aria-label={guide.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="docs-pane-head">
          <strong>{guide.title}</strong>
          <button className="docs-pane-close" onClick={onClose} aria-label="Close guide" title="Close">✕</button>
        </header>
        <iframe className="docs-pane-frame" src={guide.path} title={guide.title} />
      </aside>
    </div>
  );
}
