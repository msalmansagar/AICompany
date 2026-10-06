import type { ActionPlanRow, CaseWork } from './followUpQueries.js';
import type { PtpRow } from './caseQueries.js';
import type { CategoryTypes } from './customerHistoryQueries.js';
import { toPlanItem, type CaseContext } from './actionPlanRows.js';

/**
 * The Case Workspace's view of one case's work, composed from the read model `loadCaseWork` returns.
 *
 * Nothing here is a new Action Plan engine. Planned actions are still turned into lines by the
 * domain (`toPlanItem`); this module only says **when** each line sits — overdue, today, upcoming or
 * completed — from the dates the records carry. No due date is invented: a planned action no work
 * has answered has no date (KI-101), and an open activity without a follow-up date has none either.
 */

export type WorkGroup = 'overdue' | 'today' | 'upcoming' | 'completed';

export interface PlanWorkItem {
  key: string;
  title: string;
  /** What state it is in, in the officer's words. */
  detail: string;
  /** Who holds it. Named by `OwnerLabel`, so an integration user reads as System. */
  owner?: { id?: string; name?: string };
  group: WorkGroup;
  /** The date that placed it: the open work's follow-up, or when completed work was done. */
  dateIso?: string;
  /** The activity to complete or open. Absent for a planned action nothing has answered yet. */
  activityId?: string;
}

export type GroupedWork = Readonly<Record<WorkGroup, readonly PlanWorkItem[]>>;

/** How many completed lines the workspace shows; the full record is in the timeline. */
export const COMPLETED_SHOWN = 5;

const OPEN = 0;
const COMPLETED = 1;

export function groupCaseWork(work: CaseWork, context: CaseContext): GroupedWork {
  const planned = work.rows.flatMap(row => plannedItem(row, context));
  const followUps = work.unattributed.flatMap(activity => followUpItem(activity, context.now));
  return arrange([...planned, ...followUps]);
}

/** A planned action as a line, unless it is history: cancelled, or a previous episode's work. */
function plannedItem(row: ActionPlanRow, context: CaseContext): PlanWorkItem[] {
  const item = toPlanItem(row, context);
  const activity = row.attributed[0];
  if (!activity) return [{ key: item.key, title: item.action, detail: `${item.state} · ${item.due}`, group: 'upcoming' }];
  if (activity.stateCode === COMPLETED) return [completedItem(item.key, item.action, activity)];
  if (activity.stateCode !== OPEN && activity.stateCode !== undefined) return [];
  if (!item.isCurrent) return [];
  return [openItem(item.key, item.action, activity, context.now)];
}

/** An activity no planned action claims counts as work only while it is open with a follow-up date. */
function followUpItem(activity: PtpRow, now: Date): PlanWorkItem[] {
  if (!activity.followUpDate) return [];
  if (activity.stateCode === COMPLETED) return [completedItem(activity.id, activity.subject, activity)];
  if (activity.stateCode !== OPEN && activity.stateCode !== undefined) return [];
  return [openItem(activity.id, activity.subject, activity, now)];
}

function openItem(key: string, title: string, activity: PtpRow, now: Date): PlanWorkItem {
  const group = activity.followUpDate ? groupOfDate(activity.followUpDate, now) : 'upcoming';
  return {
    key, title, group, activityId: activity.id, detail: activity.status ?? 'Open',
    ...(activity.ownerId || activity.ownerName ? { owner: ownerOf(activity) } : {}),
    ...(activity.followUpDate ? { dateIso: activity.followUpDate } : {}),
  };
}

function ownerOf(activity: PtpRow): { id?: string; name?: string } {
  return { ...(activity.ownerId ? { id: activity.ownerId } : {}), ...(activity.ownerName ? { name: activity.ownerName } : {}) };
}

function completedItem(key: string, title: string, activity: PtpRow): PlanWorkItem {
  const doneOn = activity.activityDate ?? activity.createdOn;
  return {
    key, title, group: 'completed', activityId: activity.id,
    detail: activity.status ?? 'Completed',
    ...(doneOn ? { dateIso: doneOn } : {}),
  };
}

/** Which side of today a date falls on, in the officer's own calendar day. */
export function groupOfDate(iso: string, now: Date): Exclude<WorkGroup, 'completed'> {
  const day = localDay(new Date(iso));
  const today = localDay(now);
  if (day < today) return 'overdue';
  return day === today ? 'today' : 'upcoming';
}

function localDay(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

function arrange(items: readonly PlanWorkItem[]): GroupedWork {
  const inGroup = (group: WorkGroup) => items.filter(item => item.group === group);
  return {
    overdue: [...inGroup('overdue')].sort(byDate),
    today: [...inGroup('today')].sort(byDate),
    upcoming: [...inGroup('upcoming')].sort(byDateUndatedLast),
    completed: [...inGroup('completed')].sort(byDate).reverse().slice(0, COMPLETED_SHOWN),
  };
}

const byDate = (a: PlanWorkItem, b: PlanWorkItem) => (a.dateIso ?? '').localeCompare(b.dateIso ?? '');

function byDateUndatedLast(a: PlanWorkItem, b: PlanWorkItem): number {
  if (!a.dateIso || !b.dateIso) return Number(!a.dateIso) - Number(!b.dateIso);
  return a.dateIso.localeCompare(b.dateIso);
}

/** A line backed by an activity, which is what can be completed. */
export type CompletableWork = PlanWorkItem & { activityId: string };

const isCompletable = (item: PlanWorkItem): item is CompletableWork => item.activityId !== undefined;

/** The follow-ups "Complete follow-up" offers: what is due by today, else the next dated one. */
export function followUpsToComplete(groups: GroupedWork): readonly CompletableWork[] {
  const due = [...groups.overdue, ...groups.today].filter(isCompletable);
  if (due.length > 0) return due;
  const next = groups.upcoming.filter(isCompletable).find(item => item.dateIso);
  return next ? [next] : [];
}

/** The first line an officer would act on: the oldest overdue, then today's, then the next upcoming. */
export function nextPlannedWork(groups: GroupedWork): PlanWorkItem | undefined {
  return groups.overdue[0] ?? groups.today[0] ?? groups.upcoming[0];
}

// ── Promises ─────────────────────────────────────────────────────────────────

const OPEN_PROMISE_STATUSES: ReadonlySet<string> = new Set(['Active', 'Rescheduled']);

/** The promise the officer is waiting on: the latest still-open one, else the latest recorded. */
export function currentPromise(activities: readonly PtpRow[]): { promise: PtpRow; isOpen: boolean } | undefined {
  const promises = [...activities.filter(activity => activity.ptpDate)]
    .sort((a, b) => (b.ptpDate ?? '').localeCompare(a.ptpDate ?? ''));
  const open = promises.find(promise => OPEN_PROMISE_STATUSES.has(promise.ptpStatus ?? ''));
  if (open) return { promise: open, isOpen: true };
  return promises[0] ? { promise: promises[0], isOpen: false } : undefined;
}

export function promisesOf(activities: readonly PtpRow[]): readonly PtpRow[] {
  return activities.filter(activity => activity.ptpDate);
}

/** The newest recorded activity, whatever its kind. */
export function lastRecordedActivity(activities: readonly PtpRow[]): PtpRow | undefined {
  return activities[0];
}

// ── Resolution ───────────────────────────────────────────────────────────────

export type ResolutionProcess = 'complaint' | 'legal' | 'deceased';

export interface ResolutionStatus {
  process: ResolutionProcess;
  /** Every recorded activity of this process on the case, newest first. */
  recorded: readonly PtpRow[];
  /** The ones still open. */
  open: readonly PtpRow[];
}

/**
 * Where each centralised process stands on this case, from the activities already read.
 *
 * Classified by the same configured type codes the timeline uses, and by the external reference a
 * hand-off records. The lifecycle stays with Case Management, Legal and the deceased process — this
 * only says whether DCP has recorded anything, and what.
 */
export function resolutionStatuses(activities: readonly PtpRow[], types: CategoryTypes): readonly ResolutionStatus[] {
  return (['complaint', 'legal', 'deceased'] as const).map(process => {
    const recorded = activities.filter(activity => processOf(activity, types) === process);
    return { process, recorded, open: recorded.filter(activity => activity.stateCode === OPEN || activity.stateCode === undefined) };
  });
}

function processOf(activity: PtpRow, types: CategoryTypes): ResolutionProcess | undefined {
  const typeId = activity.activityTypeId ?? '';
  if (activity.handOff === 'Complaint' || types.concern.includes(typeId)) return 'complaint';
  if (activity.handOff === 'Legal' || types.legal.includes(typeId)) return 'legal';
  return types.deceased.includes(typeId) ? 'deceased' : undefined;
}
