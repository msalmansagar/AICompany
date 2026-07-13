/**
 * Detect clicks on the GoRules Decision-table "Documentation" link and route them to our
 * in-app guide pane instead of the library's hardcoded gorules.io tab.
 *
 * The @gorules/jdm-editor library opens each node's documentation link with
 * `window.open(node.documentationUrl)` and offers no supported override: built-in node
 * specs win over the DecisionGraph `components` prop, so the URL cannot be changed through
 * the public API. While the Advanced canvas is mounted we wrap `window.open` and, for the
 * decision-table docs URL only, invoke a callback the app uses to open our own right-docked
 * guide pane. Every other `window.open` call passes through untouched.
 *
 * We render our own pane rather than calling `Xrm.Navigation.navigateTo`, because the
 * designer is hosted as a standalone web resource where the model-driven client API
 * executor is not present and `navigateTo` throws.
 */
export const DECISION_TABLE_DOCS_WEBRESOURCE_NAME = 'qdb_gorulesdecisiontablesmodernguide';
export const DECISION_TABLE_DOCS_WEBRESOURCE_PATH = `/WebResources/${DECISION_TABLE_DOCS_WEBRESOURCE_NAME}`;

const GORULES_DOCS_HOST = 'gorules.io';
const DECISION_TABLE_TOKEN = 'decision-tables';

/**
 * True when a URL is the GoRules public documentation page for decision tables.
 */
export function isDecisionTableDocUrl(url: string): boolean {
  return url.includes(GORULES_DOCS_HOST) && url.includes(DECISION_TABLE_TOKEN);
}

function asHref(url?: string | URL | null): string {
  if (url == null) return '';
  return url instanceof URL ? url.toString() : url;
}

/**
 * Wrap `window.open` so the Decision-table documentation link opens our in-app guide pane.
 * `onDecisionTableDocs` is invoked instead of navigating. Returns a disposer that restores
 * the original `window.open`.
 */
export function installDecisionTableDocRedirect(onDecisionTableDocs: () => void): () => void {
  const originalOpen: typeof window.open = window.open;

  const patchedOpen: typeof window.open = (url, target, features) => {
    if (isDecisionTableDocUrl(asHref(url))) {
      onDecisionTableDocs();
      return null;
    }
    return originalOpen.call(window, url, target, features);
  };

  window.open = patchedOpen;
  return () => {
    window.open = originalOpen;
  };
}
