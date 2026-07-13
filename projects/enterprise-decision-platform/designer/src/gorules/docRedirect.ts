/**
 * Route the GoRules node "Documentation" links to our in-app guide panes instead of the
 * library's hardcoded gorules.io tabs.
 *
 * The @gorules/jdm-editor library opens each node's documentation link with
 * `window.open(node.documentationUrl)` and offers no supported override: built-in node
 * specs win over the DecisionGraph `components` prop, so the URLs cannot be changed through
 * the public API. While the Advanced canvas is mounted we wrap `window.open`, map the
 * recognised gorules.io doc URLs to our guide web resources, and invoke a callback the app
 * uses to open a right-docked guide pane. Every other `window.open` call passes through.
 *
 * We render our own pane rather than calling `Xrm.Navigation.navigateTo`, because the
 * designer is hosted as a standalone web resource where the model-driven client API
 * executor is not present and `navigateTo` throws.
 *
 * Web-resource paths are relative on purpose: the browser resolves them against whichever
 * Dataverse org serves the page, so the same build works in every environment.
 */
export interface DocGuide {
  readonly webResourceName: string;
  readonly path: string;
  readonly title: string;
}

function guide(webResourceName: string, title: string): DocGuide {
  return { webResourceName, path: `/WebResources/${webResourceName}`, title };
}

/** Decision-table node → decision-tables guide. */
export const DECISION_TABLE_GUIDE = guide('qdb_gorulesdecisiontablesmodernguide', 'Decision table guide');
/** Request and Response nodes → decision-graphs guide. */
export const DECISION_GRAPH_GUIDE = guide('qdb_gorulesdecisiongraphsmodernguide', 'Decision graph guide');

const GORULES_DOCS_HOST = 'gorules.io';

/**
 * Map a GoRules documentation URL to the guide we override it with, or null to leave it.
 * The Request/Response nodes use the parent `.../decisions` page; the decision-table node
 * uses its own `.../decision-tables` child page — matched before the parent so the more
 * specific page wins.
 */
export function resolveGuideForDocUrl(url: string): DocGuide | null {
  if (!url.includes(GORULES_DOCS_HOST)) return null;
  if (url.includes('decision-tables')) return DECISION_TABLE_GUIDE;
  if (/\/decisions\/?$/.test(url)) return DECISION_GRAPH_GUIDE;
  return null;
}

function asHref(url?: string | URL | null): string {
  if (url == null) return '';
  return url instanceof URL ? url.toString() : url;
}

/**
 * Wrap `window.open` so recognised GoRules documentation links open our in-app guide pane.
 * `onGuide` receives the matched guide instead of the library navigating. Returns a disposer
 * that restores the original `window.open`.
 */
export function installGoRulesDocRedirect(onGuide: (guide: DocGuide) => void): () => void {
  const originalOpen: typeof window.open = window.open;

  const patchedOpen: typeof window.open = (url, target, features) => {
    const matched = resolveGuideForDocUrl(asHref(url));
    if (matched) {
      onGuide(matched);
      return null;
    }
    return originalOpen.call(window, url, target, features);
  };

  window.open = patchedOpen;
  return () => {
    window.open = originalOpen;
  };
}
