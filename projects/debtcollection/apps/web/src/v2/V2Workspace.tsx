import type { ReactNode } from 'react';
import type { ReportingScope } from '@dcp/domain';
import { useHashRoute } from '../shell/useHashRoute.js';
import { FILTER_SEGMENT, caseListFiltersFromScope, encodeCaseListFilters } from './data/caseListFilterUrl.js';
import type { ViewDefinition } from '../shell/routes.js';
import { V2Shell } from './shell/V2Shell.js';
import { V2_PAGES } from './pages/v2Pages.js';
import './styles/v2-tokens.css';
import './styles/v2-base.css';
import './styles/v2-shell.css';
import './styles/v2-components.css';
import './styles/v2-pages.css';
import './styles/v2-bridge.css';

/**
 * Workspace V2 — the redesigned presentation, under review beside V1.
 *
 * Everything V2 draws sits inside `.dcp-v2`, where its styles and tokens are scoped, so nothing here
 * can restyle V1. It reads through the same session, data modules, services and domain as V1: a second
 * presentation, never a second implementation.
 *
 * **No route is ever lost.** A route with a V2 page renders that page; any other renders V1's own view
 * inside the V2 frame, re-skinned by the token bridge, until its V2 page replaces it. V1's router is
 * passed in rather than copied, so there is one routing table.
 */

export interface ViewRequest {
  view: ViewDefinition;
  recordId?: string | undefined;
  tab?: string | undefined;
  onOpenCase: (id: string) => void;
  /** The Cases list in a reporting scope — a dashboard row's drill-down. In V2 it opens V2's own list. */
  onOpenCases: (scope: ReportingScope) => void;
  onOpenCustomer: (customerBusinessId: string) => void;
  onOpenComms: (caseId: string) => void;
  onNavigateComms: (recordId?: string, tab?: string) => void;
}

export type ViewRenderer = (request: ViewRequest) => ReactNode;

export function V2Workspace({ renderView }: { renderView: ViewRenderer }) {
  const route = useHashRoute();
  const request: ViewRequest = {
    view: route.view,
    ...(route.recordId !== undefined ? { recordId: route.recordId } : {}),
    ...(route.tab !== undefined ? { tab: route.tab } : {}),
    onOpenCase: id => route.go('case', id),
    onOpenCases: scope => route.go('cases', FILTER_SEGMENT, encodeCaseListFilters(caseListFiltersFromScope(scope, 'dashboard'))),
    onOpenCustomer: customerBusinessId => route.go('customer', customerBusinessId),
    onOpenComms: id => route.go('comms', id),
    onNavigateComms: (recordId, tab) => route.go('comms', recordId, tab),
  };
  const Page = V2_PAGES[route.view.id];

  return (
    <div className="dcp-v2" data-workspace-version="v2" data-testid="workspace-v2">
      <V2Shell route={route}>
        {Page
          ? <Page request={request} />
          : <div className="v2-bridged" data-testid="v2-bridged">{renderView(request)}</div>}
      </V2Shell>
    </div>
  );
}
