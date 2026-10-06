import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS } from './schema.js';
import { retrieveCase } from './caseQueries.js';

/**
 * The ordered work an officer opened a case from — My Day follow-ups, a Work Queue, the Cases list or
 * a search — so the case can say "3 of 18 · Overdue follow-ups", step to the previous or next item,
 * complete and move on, and go back to the list as it was (WP5).
 *
 * **Per tab, and only what the list already loaded.** It lives in sessionStorage: a second tab works
 * its own list, a refresh keeps it, closing the tab forgets it. It holds the ids the list had loaded
 * (bounded by `MAX_ITEMS`) in the list's own order — the browser never fetches a list to fill it.
 *
 * **Nothing in it is trusted for long.** Every step revalidates the item it lands on against the
 * platform (`checkEligibility`) and skips one that was completed elsewhere, reassigned, cleared or
 * closed, so the officer never works from a stale queue.
 */

export const MAX_ITEMS = 200;
const CONTEXT_KEY = 'dcp.workContext';
const RESTORE_KEY = 'dcp.workContext.restore';

export type FollowUpWindowName = 'overdue' | 'upcoming' | 'all';

/** What keeps an item in its list, re-asked of the platform on every step. */
export type WorkEligibility =
  | { kind: 'followUps'; window: FollowUpWindowName }
  | { kind: 'queue'; bucket: string; currentUserId?: string }
  | { kind: 'cases' };

/** One line of the list: the case it opens and, for work items, the activity it is about. */
export interface WorkItemRef {
  caseId: string;
  activityId?: string;
  label: string;
}

export interface WorkContext {
  /** "Overdue follow-ups", "Work Queue · Legal", "Search “Aisha”". */
  originLabel: string;
  /** Where Back goes: the list's own route, filters included. */
  returnHash: string;
  /** Names the list for restoring its own state on Back. */
  originKey: string;
  eligibility: WorkEligibility;
  items: readonly WorkItemRef[];
  index: number;
  /** The list had more rows than it had loaded. */
  hasMore: boolean;
  totalCount?: number;
  /** The list's own choices (window, search, sort) to put back on Back. */
  listState: Readonly<Record<string, string>>;
  /** What the step that landed here skipped, said once on arrival and then removed. */
  note?: string;
}

// ── Storage ──────────────────────────────────────────────────────────────────

export function readWorkContext(): WorkContext | undefined {
  try {
    const raw = window.sessionStorage.getItem(CONTEXT_KEY);
    return raw ? (JSON.parse(raw) as WorkContext) : undefined;
  } catch {
    return undefined;
  }
}

export function writeWorkContext(context: WorkContext): void {
  try { window.sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ ...context, items: context.items.slice(0, MAX_ITEMS) })); } catch { /* tolerated: no context, no Next */ }
}

export function clearWorkContext(): void {
  try { window.sessionStorage.removeItem(CONTEXT_KEY); } catch { /* tolerated */ }
}

/** The context, only if it is about this case right now; anything else is somebody else's list. */
export function workContextFor(caseId: string): WorkContext | undefined {
  const context = readWorkContext();
  return context && context.items[context.index]?.caseId === caseId ? context : undefined;
}

/** Called by a list as it opens one of its rows. */
export function startWorkContext(context: WorkContext): void {
  writeWorkContext(context);
}

// ── Back: the list puts itself back as it was ────────────────────────────────

export function requestRestore(context: WorkContext): void {
  try { window.sessionStorage.setItem(RESTORE_KEY, context.originKey); } catch { /* tolerated */ }
}

/**
 * The list's saved choices, once, if Back was asked for this list. Read on mount by the list; a later
 * visit from the navigation starts fresh, as it always has.
 */
export function takeRestoredState(originKey: string): Readonly<Record<string, string>> | undefined {
  try {
    if (window.sessionStorage.getItem(RESTORE_KEY) !== originKey) return undefined;
    window.sessionStorage.removeItem(RESTORE_KEY);
    return readWorkContext()?.listState;
  } catch {
    return undefined;
  }
}

// ── Position ─────────────────────────────────────────────────────────────────

/** "3 of 18 · Overdue follow-ups"; "3 of 18+ …" when the list had more than it had loaded. */
export function describePosition(context: WorkContext): string {
  const known = context.totalCount ?? context.items.length;
  const more = context.totalCount === undefined && context.hasMore ? '+' : '';
  return `${context.index + 1} of ${known}${more} · ${context.originLabel}`;
}

// ── Revalidation ─────────────────────────────────────────────────────────────

export type Eligibility = { eligible: true } | { eligible: false; reason: string };

const ACTIVITY_CHECK_COLUMNS = ['activityid', 'statecode', 'qdb_followupdate', '_ownerid_value'];
const OPEN = 0;

/** What a revalidation reads with, and the moment it judges "overdue" against. */
export interface CheckSession {
  adapter: XrmCrmAdapter;
  now: Date;
}

/** Asks the platform whether an item still belongs to its list. One bounded read per item. */
export async function checkEligibility(session: CheckSession, item: WorkItemRef, eligibility: WorkEligibility): Promise<Eligibility> {
  const { adapter, now } = session;
  if (eligibility.kind === 'cases' || !item.activityId) return checkCase(adapter, item.caseId);
  const row = await adapter.retrieve({ entity: ENTITY_SETS.collectionActivity, id: item.activityId }, ACTIVITY_CHECK_COLUMNS);
  if (!row) return { eligible: false, reason: 'it no longer exists' };
  if (row['statecode'] !== OPEN) return { eligible: false, reason: 'it was completed or cancelled' };
  return eligibility.kind === 'followUps'
    ? checkFollowUp(row['qdb_followupdate'], eligibility.window, now)
    : checkQueueItem(row['_ownerid_value'], eligibility);
}

async function checkCase(adapter: XrmCrmAdapter, caseId: string): Promise<Eligibility> {
  const detail = await retrieveCase(adapter, caseId);
  if (!detail) return { eligible: false, reason: 'the case can no longer be read' };
  return detail.isOpen ? { eligible: true } : { eligible: false, reason: 'the case is closed' };
}

function checkFollowUp(followUpDate: unknown, window: FollowUpWindowName, now: Date): Eligibility {
  if (typeof followUpDate !== 'string' || !followUpDate) return { eligible: false, reason: 'its follow-up was cleared' };
  const isPast = Date.parse(followUpDate) < now.getTime();
  if (window === 'overdue' && !isPast) return { eligible: false, reason: 'it is no longer overdue' };
  if (window === 'upcoming' && isPast) return { eligible: false, reason: 'it is now overdue' };
  return { eligible: true };
}

/** "My work" is the officer's own; any other bucket keeps open work whoever holds it. */
function checkQueueItem(ownerId: unknown, eligibility: { bucket: string; currentUserId?: string }): Eligibility {
  if (eligibility.bucket !== 'MyAssigned' || !eligibility.currentUserId) return { eligible: true };
  const isMine = typeof ownerId === 'string' && ownerId.toLowerCase() === eligibility.currentUserId.toLowerCase();
  return isMine ? { eligible: true } : { eligible: false, reason: 'it was reassigned' };
}

/** A refused or failed read is not a reason to open the item: it is skipped, and the officer is told. */
function unreadable(): Eligibility {
  return { eligible: false, reason: 'it could not be read just now' };
}

/** How many items one step may revalidate before it stops and says so. */
export const MAX_CHECKS_PER_STEP = 10;

export interface StepResult {
  /** The item landed on, if any. */
  index?: number;
  /** Items passed over, each with why. */
  skipped: readonly { label: string; reason: string }[];
  /** True when the check budget ran out before an eligible item was found. */
  stoppedEarly: boolean;
}

/** Walks from the current item in one direction to the first that is still eligible. */
export async function findEligible(session: CheckSession, context: WorkContext, step: 1 | -1): Promise<StepResult> {
  const skipped: { label: string; reason: string }[] = [];
  for (let index = context.index + step, checks = 0; index >= 0 && index < context.items.length; index += step, checks += 1) {
    if (checks >= MAX_CHECKS_PER_STEP) return { skipped, stoppedEarly: true };
    const item = context.items[index]!;
    const verdict = await checkEligibility(session, item, context.eligibility).catch(unreadable);
    if (verdict.eligible) return { index, skipped, stoppedEarly: false };
    skipped.push({ label: item.label, reason: verdict.reason });
  }
  return { skipped, stoppedEarly: false };
}
