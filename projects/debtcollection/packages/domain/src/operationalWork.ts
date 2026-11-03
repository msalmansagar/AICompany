/**
 * The operational read model — one place to answer "what needs my attention now?".
 *
 * **It aggregates; it does not own.** Every row here is a *view* of a record whose lifecycle lives
 * somewhere else: an activity, a Legal Recommendation, a dispute, a deceased review. Nothing is
 * copied, nothing is persisted, and no work item exists that is not already a record.
 *
 * Three properties do most of the work, and each exists because the obvious implementation is
 * wrong:
 *
 * **One record, many buckets.** A single activity can be *mine*, *due soon* and *a Legal
 * Recommendation* at once. Those are three classifications of one piece of work, not three pieces
 * of work — so identity is the authoritative record's id, buckets are a set, and the counts are
 * explicitly documented as overlapping.
 *
 * **No universal lifecycle.** There is no `New → In Progress → Done` here. A Litigation Request,
 * a Complaint Case and a collection activity have genuinely different states owned by genuinely
 * different processes, and flattening them to make a list look tidy would invent business meaning.
 * Only what is *actually* common is normalised.
 *
 * **Unknown is not zero.** A count that could not be obtained is `null`, and the screen says so.
 * `Xrm.WebApi` does not return `@odata.count` (KI-96), so this distinction is not theoretical —
 * it is the difference between "no overdue work" and "we could not find out".
 */

// ── What kind of work a row is ───────────────────────────────────────────────

/**
 * The work types the workspace aggregates.
 *
 * Restructuring appears as a **Collection-side recommendation only**. The downstream Facility
 * Amendment integration is parked, so nothing here can represent a submitted, approved or
 * in-progress amendment — there is no such state to read.
 */
export type WorkType =
  | 'CollectionActivity'
  | 'PromiseToPay'
  | 'LegalRecommendation'
  | 'CollectionDispute'
  | 'CustomerComplaint'
  | 'DeceasedReview'
  | 'RestructuringRecommendation';

const WORK_TYPE_LABEL: Readonly<Record<WorkType, string>> = {
  CollectionActivity: 'Collection action',
  PromiseToPay: 'Promise to pay',
  LegalRecommendation: 'Legal recommendation',
  CollectionDispute: 'Collection dispute',
  CustomerComplaint: 'Customer complaint',
  DeceasedReview: 'Deceased review',
  // Deliberately "recommendation" — never "Facility Amendment", which is not integrated.
  RestructuringRecommendation: 'Restructuring recommendation',
};

export function describeWorkType(type: WorkType): string {
  return WORK_TYPE_LABEL[type];
}

// ── The buckets an officer filters by ────────────────────────────────────────

/**
 * Operational buckets. **These overlap by design**, and a caller must never sum them.
 *
 * `bucketTotalsAreDisjoint` exists so that intent is testable rather than a convention somebody
 * forgets: adding "mine" to "due soon" and calling the result total work would double-count every
 * piece of work that is both.
 */
export type OperationalBucket =
  | 'MyAssigned'
  | 'AwaitingAssignment'
  | 'AssignmentRequiresAttention'
  | 'DueSoon'
  | 'Overdue'
  | 'Escalated'
  | 'Legal'
  | 'Disputes'
  | 'Complaints'
  | 'DeceasedReview'
  | 'RestructuringRecommendations';

const BUCKET_LABEL: Readonly<Record<OperationalBucket, string>> = {
  MyAssigned: 'My work',
  AwaitingAssignment: 'Awaiting assignment',
  AssignmentRequiresAttention: 'Assignment needs attention',
  DueSoon: 'Due soon',
  Overdue: 'Overdue',
  Escalated: 'Escalated',
  Legal: 'Legal',
  Disputes: 'Disputes',
  Complaints: 'Complaints',
  DeceasedReview: 'Deceased review',
  RestructuringRecommendations: 'Restructuring recommendations',
};

export function describeBucket(bucket: OperationalBucket): string {
  return BUCKET_LABEL[bucket];
}

/** Buckets overlap. Always. This is a constant so the rule can be asserted, not remembered. */
export function bucketTotalsAreDisjoint(): false {
  return false;
}

// ── The common shape ─────────────────────────────────────────────────────────

/**
 * What every work type genuinely has in common — and nothing more.
 *
 * Domain-specific state stays in its own domain and is carried through as an opaque `domainState`
 * label that this module never interprets. That is the difference between normalising identity and
 * inventing a lifecycle.
 */
export interface WorkItem {
  /** The authoritative record's own id. **This is the work's identity.** */
  id: string;
  type: WorkType;
  /** What an officer reads first. */
  title: string;
  caseId: string;
  caseNumber?: string;
  customerName?: string;
  facilityNumber?: string;
  ownerId?: string;
  ownerName?: string;
  createdOn?: string;
  /** Only where an authoritative deadline could be determined. Absent is not "today". */
  dueAt?: string;
  /**
   * The state the owning domain reports, passed through untouched.
   *
   * A Complaint's is Case Management's; a Litigation Request's is Legal's; an activity's is its
   * own. Nothing here maps, groups or re-interprets them.
   */
  domainState?: string;
  /** False once the delinquency episode is no longer current. Historical work stays readable. */
  isCurrent: boolean;
}

/**
 * Which buckets a work item belongs to.
 *
 * Returns a **set**, because the honest answer is usually more than one. The rules are deliberately
 * conservative: nothing is Overdue without a real deadline, and nothing is Escalated merely for
 * being late.
 */
export function bucketsFor(
  item: WorkItem,
  context: { currentUserId?: string; now: Date; dueSoonHours?: number; escalated?: boolean },
): ReadonlySet<OperationalBucket> {
  const buckets = new Set<OperationalBucket>();

  // Historical work is readable through the case, never in an operational queue.
  if (!item.isCurrent) return buckets;

  if (context.currentUserId && item.ownerId === context.currentUserId) {
    buckets.add('MyAssigned');
  }
  if (!item.ownerId) buckets.add('AwaitingAssignment');

  addDeadlineBuckets(item, context, buckets);

  // Escalation is a state that exists, never an inference from lateness.
  if (context.escalated === true) buckets.add('Escalated');

  const byType = BUCKET_BY_TYPE[item.type];
  if (byType) buckets.add(byType);

  return buckets;
}

/**
 * Due soon and overdue, and the two ways they are commonly got wrong.
 *
 * A missing deadline means **undetermined**, not overdue — most TAT configuration is absent on
 * this organisation (KI-101, KI-102), and treating absence as lateness would make the queue mostly
 * red for no reason. And `dueSoonHours` must be configured: without a warning window there is no
 * such thing as "soon".
 */
function addDeadlineBuckets(
  item: WorkItem,
  context: { now: Date; dueSoonHours?: number },
  buckets: Set<OperationalBucket>,
): void {
  if (!item.dueAt) return;

  const due = new Date(item.dueAt).getTime();
  if (context.now.getTime() > due) {
    buckets.add('Overdue');
    return;
  }
  if (context.dueSoonHours === undefined) return;
  if (context.now.getTime() > due - context.dueSoonHours * 3_600_000) buckets.add('DueSoon');
}

const BUCKET_BY_TYPE: Readonly<Partial<Record<WorkType, OperationalBucket>>> = {
  LegalRecommendation: 'Legal',
  CollectionDispute: 'Disputes',
  CustomerComplaint: 'Complaints',
  DeceasedReview: 'DeceasedReview',
  RestructuringRecommendation: 'RestructuringRecommendations',
};

// ── Counts ───────────────────────────────────────────────────────────────────

/**
 * A count that knows whether it is a count.
 *
 * `Xrm.WebApi` silently omits `@odata.count`, so a naive reader sees `undefined` and renders zero
 * — which is how a queue tells an officer there is no overdue work when it simply could not ask
 * (KI-96). Three states, and the screen distinguishes all three.
 */
export type WorkCount =
  | { known: true; value: number }
  | { known: false; reason: 'NotRequested' | 'Unavailable' };

export function knownCount(value: number): WorkCount {
  return { known: true, value };
}

export function unknownCount(reason: 'NotRequested' | 'Unavailable' = 'Unavailable'): WorkCount {
  return { known: false, reason };
}

/** What a tile shows. Never `0` for something nobody asked or could answer. */
export function describeCount(count: WorkCount): string {
  if (count.known) return String(count.value);
  return count.reason === 'NotRequested' ? '—' : 'Unknown';
}

/**
 * Turns a possibly-absent platform count into a `WorkCount`.
 *
 * `null` is what the adapter returns when the platform did not answer, and it becomes *unknown*
 * rather than zero. A real zero stays a real zero.
 */
export function toWorkCount(value: number | null | undefined): WorkCount {
  return typeof value === 'number' ? knownCount(value) : unknownCount();
}

// ── De-duplication ───────────────────────────────────────────────────────────

/**
 * Collapses the same record appearing from more than one source into one work item.
 *
 * A Legal Recommendation read by the Legal query and by the activity query is **one** piece of
 * work. Keyed on the authoritative record id, so navigation and refresh cannot multiply it — the
 * duplicate-row failure that makes an infinite-scrolling queue untrustworthy.
 */
export function dedupeWork(items: readonly WorkItem[]): readonly WorkItem[] {
  const byId = new Map<string, WorkItem>();
  for (const item of items) {
    const key = item.id.toLowerCase();
    if (!byId.has(key)) byId.set(key, item);
  }
  return [...byId.values()];
}

/** How many distinct pieces of work a set of items represents. Never the sum of bucket counts. */
export function distinctWorkCount(items: readonly WorkItem[]): number {
  return new Set(items.map(item => item.id.toLowerCase())).size;
}
