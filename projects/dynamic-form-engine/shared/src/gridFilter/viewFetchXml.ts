// Turns a saved view's FetchXML into the query one grid page needs: the view keeps
// owning the columns, filter and sort, and the grid layers paging, its own columns,
// an optional sort override, and the depends-on/column filters on top.
//
// Paging is page-number based (page + count), never a paging cookie: the cursor
// round-trip fails with 0x80041129 whenever the query's order and the cookie's encoded
// order columns diverge, which is exactly what a user-driven sort does.

export interface ViewFetchXmlRequest {
  /** The saved view's own FetchXML — never mutated. */
  baseXml: string;
  page: number;
  pageSize: number;
  /** Grid column attributes that must be selected even if the view omits them. */
  columnAttributes?: string[];
  /** A FetchXML <filter>/<condition> subtree to AND onto the view's own filter. */
  filterXml?: string;
  /**
   * <link-entity> joins to append to the entity. Filtering a lookup column by its display
   * text is a join onto the related entity, not a condition — a lookup attribute only
   * compares by GUID.
   */
  linkEntityXml?: string;
  /** Sort override; when absent the view's own <order> is preserved. */
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

/** Rewrites the view's FetchXML for one page of grid data. */
export function buildViewFetchXml(request: ViewFetchXmlRequest): string {
  let xml = request.baseXml;
  xml = ensureAttributes(xml, request.columnAttributes ?? []);
  xml = applyPaging(xml, request.page, request.pageSize);
  xml = applySort(xml, request.sortBy, request.sortDirection);
  xml = applyFilter(xml, request.filterXml);
  return applyLinkEntities(xml, request.linkEntityXml);
}

// The view may not select every column the grid displays, and FetchXML returns only
// what it selects — a missing attribute renders as a blank cell.
function ensureAttributes(xml: string, attributes: string[]): string {
  let result = xml;
  for (const attribute of attributes) {
    if (!attribute) continue;
    if (new RegExp(`<attribute[^>]+name="${attribute}"`).test(result)) continue;
    result = result.replace('</entity>', `<attribute name="${attribute}"/></entity>`);
  }
  return result;
}

function applyPaging(xml: string, page: number, pageSize: number): string {
  return xml.replace(/<fetch([^>]*)>/, (_match, existingAttributes: string) => {
    const cleaned = existingAttributes
      .replace(/\s+page="[^"]*"/g, '')
      .replace(/\s+count="[^"]*"/g, '')
      .replace(/\s+top="[^"]*"/g, '')
      .replace(/\s+paging-cookie="[^"]*"/g, '')
      .replace(/\s+returntotalrecordcount="[^"]*"/g, '');
    return `<fetch${cleaned} page="${page}" count="${pageSize}" returntotalrecordcount="true">`;
  });
}

// A user sort replaces the view's ordering; without one the view's <order> stays, so
// page boundaries remain stable across requests.
function applySort(xml: string, sortBy?: string, sortDirection?: 'asc' | 'desc'): string {
  if (!sortBy) return xml;
  const descending = sortDirection === 'desc' ? 'true' : 'false';
  return xml
    .replace(/<order\b[^>]*\/>/g, '')
    .replace(/<order\b[^>]*>[\s\S]*?<\/order>/g, '')
    .replace('</entity>', `<order attribute="${sortBy}" descending="${descending}"/></entity>`);
}

function applyFilter(xml: string, filterXml?: string): string {
  if (!filterXml) return xml;
  const wrapped = filterXml.startsWith('<filter') ? filterXml : `<filter type="and">${filterXml}</filter>`;
  return xml.replace('</entity>', `${wrapped}</entity>`);
}

function applyLinkEntities(xml: string, linkEntityXml?: string): string {
  if (!linkEntityXml) return xml;
  return xml.replace('</entity>', `${linkEntityXml}</entity>`);
}
