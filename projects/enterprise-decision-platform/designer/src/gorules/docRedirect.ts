/**
 * Redirect the GoRules Decision-table "Documentation" link to our in-CRM guide.
 *
 * The @gorules/jdm-editor library hardcodes each node's documentation link and opens it
 * with `window.open(node.documentationUrl)` (see its bundled decision-table node spec).
 * It offers no supported override: built-in node specs win over the DecisionGraph
 * `components` prop, so the URL cannot be changed through the public API. While the
 * Advanced canvas is mounted we therefore wrap `window.open` and rewrite only the
 * decision-table docs URL to our web resource, passing every other call through untouched.
 *
 * A relative web-resource path is used on purpose: the browser resolves it against
 * whichever Dataverse org is serving the page, so the same build works in every
 * environment with no per-environment change on deploy.
 */
export const DECISION_TABLE_DOCS_WEBRESOURCE = '/WebResources/qdb_gorulesdecisiontablesmodernguide';

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
 * Wrap `window.open` so the Decision-table documentation link points to our web resource.
 * Returns a disposer that restores the original `window.open`.
 */
export function installDecisionTableDocRedirect(): () => void {
  const originalOpen: typeof window.open = window.open;

  const patchedOpen: typeof window.open = (url, target, features) => {
    if (isDecisionTableDocUrl(asHref(url))) {
      return originalOpen.call(window, DECISION_TABLE_DOCS_WEBRESOURCE, '_blank', 'noopener');
    }
    return originalOpen.call(window, url, target, features);
  };

  window.open = patchedOpen;
  return () => {
    window.open = originalOpen;
  };
}
