/**
 * Redirect the GoRules Decision-table "Documentation" link to our in-CRM guide,
 * opened as a right-docked side pane (the Dataverse record-form slide-in experience)
 * rather than a new browser tab.
 *
 * The @gorules/jdm-editor library hardcodes each node's documentation link and opens it
 * with `window.open(node.documentationUrl)` (see its bundled decision-table node spec).
 * It offers no supported override: built-in node specs win over the DecisionGraph
 * `components` prop, so the URL cannot be changed through the public API. While the
 * Advanced canvas is mounted we therefore wrap `window.open` and, for the decision-table
 * docs URL only, open our guide web resource via `Xrm.Navigation.navigateTo` as a side
 * dialog. Every other `window.open` call passes through untouched.
 *
 * When Xrm is not in scope (local dev), we fall back to opening the guide by its relative
 * web-resource path. The relative path is deliberate: the browser resolves it against
 * whichever Dataverse org serves the page, so the same build works in every environment.
 */
export const DECISION_TABLE_DOCS_WEBRESOURCE_NAME = 'qdb_gorulesdecisiontablesmodernguide';
export const DECISION_TABLE_DOCS_WEBRESOURCE_PATH = `/WebResources/${DECISION_TABLE_DOCS_WEBRESOURCE_NAME}`;
const DOCS_PANE_TITLE = 'Decision table guide';
const DOCS_PANE_WIDTH_PX = 500;

const GORULES_DOCS_HOST = 'gorules.io';
const DECISION_TABLE_TOKEN = 'decision-tables';

type WebResourcePageInput = { pageType: 'webresource'; webresourceName: string };
type NavigationOptions = {
  target: 1 | 2;
  position?: 1 | 2;
  width?: { value: number; unit: 'px' | '%' };
  title?: string;
};
type NavigateTo = (page: WebResourcePageInput, options: NavigationOptions) => Promise<void>;
interface XrmNavigator {
  Navigation?: { navigateTo?: NavigateTo };
}

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

function resolveXrm(): XrmNavigator | null {
  const scope = window as unknown as { Xrm?: XrmNavigator; parent?: { Xrm?: XrmNavigator } };
  return scope.Xrm ?? scope.parent?.Xrm ?? null;
}

/**
 * Wrap `window.open` so the Decision-table documentation link opens our guide as a
 * right-docked side pane inside CRM. Returns a disposer that restores `window.open`.
 */
export function installDecisionTableDocRedirect(): () => void {
  const originalOpen: typeof window.open = window.open;

  const openGuideInSidePane = (): void => {
    const navigateTo = resolveXrm()?.Navigation?.navigateTo;
    if (!navigateTo) {
      originalOpen.call(window, DECISION_TABLE_DOCS_WEBRESOURCE_PATH, '_blank', 'noopener');
      return;
    }
    navigateTo(
      { pageType: 'webresource', webresourceName: DECISION_TABLE_DOCS_WEBRESOURCE_NAME },
      { target: 2, position: 2, width: { value: DOCS_PANE_WIDTH_PX, unit: 'px' }, title: DOCS_PANE_TITLE },
    ).catch(() => {
      originalOpen.call(window, DECISION_TABLE_DOCS_WEBRESOURCE_PATH, '_blank', 'noopener');
    });
  };

  const patchedOpen: typeof window.open = (url, target, features) => {
    if (isDecisionTableDocUrl(asHref(url))) {
      openGuideInSidePane();
      return null;
    }
    return originalOpen.call(window, url, target, features);
  };

  window.open = patchedOpen;
  return () => {
    window.open = originalOpen;
  };
}
