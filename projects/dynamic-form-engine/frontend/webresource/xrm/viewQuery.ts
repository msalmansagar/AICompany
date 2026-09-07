// Runs a grid page against the saved view configured on the field, so the in-CRM engine
// honours the same view the portal does (its columns, filter and sort) and pages on it.
//
// Xrm.WebApi.retrieveMultipleRecords does not surface the paging annotations FetchXML
// returns, so the query goes through a same-origin fetch (cookie auth, the pattern
// optionsApi already uses for metadata) with annotations requested explicitly.
import { webApi, webApiBaseUrl } from './xrmClient';
import { resolveEntitySetName, resolveLookupNavigationProperty } from './lookupBinding';

const MORE_RECORDS = '@Microsoft.Dynamics.CRM.morerecords';
const TOTAL_RECORD_COUNT = '@Microsoft.Dynamics.CRM.totalrecordcount';
const TOTAL_COUNT_EXCEEDED = '@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded';
const SYSTEM_VIEW_QUERY_TYPE = 0;

export interface ViewPageResult {
  rows: Record<string, unknown>[];
  hasNextPage: boolean;
  totalCount?: number;
}

const fetchXmlByViewId = new Map<string, string>();

/**
 * Reads the saved view's FetchXML, cached per view for the page's lifetime.
 * Returns null when the view is missing or is not a System View, so the caller can fall
 * back to querying the entity directly rather than failing the whole grid.
 */
export async function resolveViewFetchXml(viewId: string): Promise<string | null> {
  const cached = fetchXmlByViewId.get(viewId);
  if (cached) return cached;

  try {
    const view = await webApi().retrieveRecord('savedquery', viewId, '?$select=fetchxml,querytype');
    const fetchXml = view.fetchxml as string | undefined;
    const queryType = view.querytype as number | undefined;
    if (!fetchXml) return null;
    if (queryType !== undefined && queryType !== SYSTEM_VIEW_QUERY_TYPE) return null;

    fetchXmlByViewId.set(viewId, fetchXml);
    return fetchXml;
  } catch {
    return null;
  }
}

/** Executes one FetchXML page and reports whether more pages follow. */
export async function fetchViewPage(
  entityLogicalName: string,
  fetchXml: string,
  signal?: AbortSignal,
): Promise<ViewPageResult> {
  const entitySetName = await resolveEntitySetName(entityLogicalName);
  if (!entitySetName) throw new Error(`Could not resolve the entity set for ${entityLogicalName}`);

  const url = `${webApiBaseUrl()}/${entitySetName}?fetchXml=${encodeURIComponent(fetchXml)}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
    credentials: 'same-origin',
    signal,
  });
  if (!response.ok) throw new Error(`Grid view query failed with status ${response.status}`);

  const payload = await response.json() as Record<string, unknown> & { value?: Record<string, unknown>[] };
  const countExceeded = payload[TOTAL_COUNT_EXCEEDED] === true;
  const rawTotal = payload[TOTAL_RECORD_COUNT];

  return {
    rows: payload.value ?? [],
    hasNextPage: payload[MORE_RECORDS] === true,
    totalCount: !countExceeded && typeof rawTotal === 'number' && rawTotal >= 0 ? rawTotal : undefined,
  };
}
