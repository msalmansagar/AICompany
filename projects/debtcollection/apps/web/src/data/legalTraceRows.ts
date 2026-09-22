import {
  describeLegalWork, type CustomerTable, type LegalQualificationPolicy, type LegalWorkState,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { ActivityRow } from './caseQueries.js';
import { loadLitigation } from './legalQueries.js';

/**
 * The Legal picture for one case, assembled from what the platform actually holds.
 *
 * Two questions, answered from two different sources and deliberately not merged:
 *
 * **Is there a Litigation Request?** Answered by the `qdb_legalrequestid` lookup and, where it is
 * set, by reading that one record. Never by searching Legal for the customer, the name or the
 * date — each of those would sometimes find a *different* matter and the officer could not tell.
 *
 * **Is this a Legal Recommendation at all?** Answered by the activity type's **code**, not its
 * display name — a label is editable configuration, and a rename would silently empty this screen
 * (the KI-52 shape). Where no Legal type code is identifiable, recommendation-side states are not
 * claimed at all rather than guessed (**KI-112**).
 */

/**
 * The code convention that identifies the Legal Recommendation activity type.
 *
 * `qdb_collectionactivitytype.qdb_code` holds stable codes (`P6-LEGALREC`, `P6-PTP`, `DEMO-PTP`);
 * `qdb_category` is null on all twelve types, so the code is the only structured handle available.
 * The suffix is matched rather than the whole value because the prefix varies with how the
 * catalogue was seeded, and hard-coding a full code would be a business rule in source.
 *
 * QDB has not confirmed this convention — see KI-112. If a type is later identified some other
 * way, this is the single place that changes.
 */
const LEGAL_RECOMMENDATION_CODE_SUFFIX = 'LEGALREC';

export function isLegalRecommendationCode(code: string | undefined): boolean {
  if (!code) return false;
  return code.toUpperCase().endsWith(LEGAL_RECOMMENDATION_CODE_SUFFIX);
}

/** One Legal Recommendation, with everything the officer is shown about it. */
export interface LegalTraceRow {
  key: string;
  /** The recommendation's own subject. Collection work, never the Litigation Request. */
  recommendation: string;
  recordedOn: string;
  /** Who holds the collection work. Never the Litigation Request's owner. */
  ownerName: string;
  /** The activity's own status or outcome — Collection's, not Legal's. */
  activityStatus: string;
  /** Whether the strategy asked for this recommendation, or an officer did. */
  origin: string;
  trace: LegalWorkState;
}

export interface LegalTraceContext {
  /** Activity type ids whose code identifies them as Legal Recommendations. */
  legalTypeIds: ReadonlySet<string>;
  episodeIsCurrent: (activity: ActivityRow) => boolean;
  formatDate: (iso: string) => string;
  /**
   * The collection case's customer, as the platform reports its table.
   *
   * Decides BFD from HL without an organisation code: an account resolves, a contact does not
   * (KI-108). Nothing converts one into the other.
   */
  customer: { table?: CustomerTable; id?: string };
  /**
   * QDB's qualification policy. **Empty today** (KI-109), and empty keeps hand-off closed.
   *
   * Threaded through rather than read here so that the day it is configured, exactly one call site
   * changes and every state below follows.
   */
  policy: LegalQualificationPolicy;
  describeOrigin: (activity: ActivityRow) => string;
}

/**
 * Builds the Legal rows for a case.
 *
 * Reads at most one Legal record per linked recommendation, by id. Nothing here grows with the
 * book: a case has a handful of Legal Recommendations, and an unlinked one costs no read at all.
 */
export async function loadLegalTraces(
  adapter: XrmCrmAdapter,
  activities: readonly ActivityRow[],
  context: LegalTraceContext,
): Promise<readonly LegalTraceRow[]> {
  const relevant = activities.filter(activity =>
    Boolean(activity.legalRequestId)
    || (activity.activityTypeId !== undefined && context.legalTypeIds.has(activity.activityTypeId)));

  return Promise.all(relevant.map(activity => toLegalTraceRow(adapter, activity, context)));
}

async function toLegalTraceRow(
  adapter: XrmCrmAdapter,
  activity: ActivityRow,
  context: LegalTraceContext,
): Promise<LegalTraceRow> {
  // A read is attempted only where a link exists. No link means nothing to look up — not a
  // licence to go looking.
  const fetch = activity.legalRequestId
    ? await loadLitigation(adapter, activity.legalRequestId)
    : undefined;

  const trace = describeLegalWork({
    recommendation: {
      activityId: activity.id,
      lifecycle: lifecycleOf(activity),
      isLegalRecommendation: true,
      ...(activity.legalRequestId !== undefined
        ? { litigationRequestId: activity.legalRequestId } : {}),
    },
    customer: context.customer,
    policy: context.policy,
    ...(fetch !== undefined ? { fetch } : {}),
    episodeIsCurrent: context.episodeIsCurrent(activity),
  });

  return {
    key: activity.id,
    recommendation: activity.subject,
    recordedOn: activity.createdOn ? context.formatDate(activity.createdOn) : '—',
    ownerName: activity.ownerName ?? 'Nobody yet',
    activityStatus: activity.status ?? 'Open',
    origin: context.describeOrigin(activity),
    trace,
  };
}

/** Open, completed or cancelled, from the platform's own state code. */
function lifecycleOf(activity: ActivityRow): 'Open' | 'Completed' | 'Cancelled' {
  if (activity.stateCode === 1) return 'Completed';
  if (activity.stateCode === 2) return 'Cancelled';
  return 'Open';
}
