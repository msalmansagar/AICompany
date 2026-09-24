import {
  belongsToEpisode, describeOriginLabel,
  type CustomerTable, type LegalQualificationPolicy, type Page,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ACTIVITY_COLUMNS, ENTITY_SETS } from './schema.js';
import { CASE_CARD_PAGE_SIZE, escapeOData, mapPage } from './collectionQueries.js';
import { toActivityRow, type ActivityRow } from './caseQueries.js';
import { loadActivityTypes } from './configurationCatalog.js';
import { isLegalRecommendationCode, loadLegalTraces, type LegalTraceRow } from './legalTraceRows.js';

export type { LegalTraceRow } from './legalTraceRows.js';

/** One case's Legal rows, and whether the case holds more than one card's worth. */
export interface CaseLegalPicture {
  rows: readonly LegalTraceRow[];
  hasMore: boolean;
}

/**
 * QDB's Legal qualification rule, as this workspace holds it: **empty, deliberately.**
 *
 * QDB has established no rule that qualifies a recommendation for litigation (KI-109), and an empty
 * policy is what keeps every hand-off closed. Populating it here to make the screen look finished
 * would be this build inventing QDB's legal authority. One constant, so the Legal card and the
 * capability matrix read the same answer.
 */
export const LEGAL_QUALIFICATION_POLICY: LegalQualificationPolicy = {};

/**
 * Reading one case's Legal picture.
 *
 * Three bounded reads and then, at most, one Legal record per linked recommendation — each by id,
 * through the `qdb_legalrequestid` lookup. **No Legal query is ever issued**: there is no search of
 * `qdb_qdblegal` by customer, name or date, so nothing on this path can return a list that grows
 * with the book, and nothing can return somebody else's matter.
 *
 * The activity read is narrowed by the platform to the recommendations that could be Legal at all,
 * rather than fetching the case's activities and sifting them here.
 */
export async function loadCaseLegalTraces(
  adapter: XrmCrmAdapter,
  caseId: string,
  episodeNumber?: number,
  customer: { table?: CustomerTable; id?: string } = {},
): Promise<CaseLegalPicture> {
  const legalTypeIds = await readLegalTypeIds(adapter);
  const page = await readLegalCandidates(adapter, caseId, legalTypeIds);

  const rows = await loadLegalTraces(adapter, page.items, {
    legalTypeIds,
    episodeIsCurrent: activity => isCurrentEpisode(activity, caseId, episodeNumber),
    formatDate: iso => iso.slice(0, 10),
    customer,
    policy: LEGAL_QUALIFICATION_POLICY,
    describeOrigin: activity => describeOriginLabel(activity.origin),
  });
  return { rows, hasMore: page.hasMore };
}

/**
 * Which activity types are Legal Recommendations, by code.
 *
 * Reuses the officer-facing catalogue read rather than issuing a second one — it is already
 * bounded and already ordered as configuration orders it. The **code** is what identifies the
 * type; the display name is editable configuration, and a rename would silently empty this screen.
 */
async function readLegalTypeIds(adapter: XrmCrmAdapter): Promise<ReadonlySet<string>> {
  const types = await loadActivityTypes(adapter);
  return new Set(types.filter(type => isLegalRecommendationCode(type.code)).map(type => type.id));
}

/**
 * The case's activities that could concern Legal, narrowed by the source.
 *
 * Two clauses, both sent to the platform: the activity already carries a Legal link, **or** its
 * type is one of the Legal Recommendation types. A recommendation with no link and a linked
 * activity whose type was later changed both have to appear, and neither would if only one clause
 * were sent.
 */
async function readLegalCandidates(
  adapter: XrmCrmAdapter,
  caseId: string,
  legalTypeIds: ReadonlySet<string>,
): Promise<Page<ActivityRow>> {
  const typeClause = [...legalTypeIds]
    .map(id => `_qdb_activitytypeid_value eq ${escapeOData(id)}`)
    .join(' or ');
  const legalSide = typeClause
    ? `(_qdb_legalrequestid_value ne null or (${typeClause}))`
    : '_qdb_legalrequestid_value ne null';

  return mapPage(
    await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      pageSize: CASE_CARD_PAGE_SIZE,
      sort: [{ field: 'createdon', descending: true }],
      filter: `_qdb_collectioncaseid_value eq ${escapeOData(caseId)} and ${legalSide}`,
    }),
    toActivityRow,
  );
}

/**
 * Whether the recommendation belongs to the case's current arrears episode.
 *
 * Decided by the collection episode **alone**. A Litigation Request that is still live in Legal
 * says nothing about which arrears episode an officer is working now, and a closed one does not
 * retire a current episode's recommendation.
 */
function isCurrentEpisode(
  activity: ActivityRow,
  caseId: string,
  episodeNumber?: number,
): boolean {
  if (episodeNumber === undefined || !activity.strategyActionId) return true;
  return belongsToEpisode(
    { activityId: activity.id, state: 'Open', strategyActionId: activity.strategyActionId },
    { caseId, episodeNumber },
  );
}

/**
 * The Legal Recommendation type, for asking whether such work can be concluded.
 *
 * The first configured type wins, which is the same rule `readLegalTypeIds` applies when it
 * narrows the read — there is one in practice, and picking differently here would make the card
 * describe a type the rows do not belong to.
 */
export async function findLegalTypeId(adapter: XrmCrmAdapter): Promise<string | undefined> {
  const ids = await readLegalTypeIds(adapter);
  return [...ids][0];
}
