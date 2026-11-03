import {
  isConcurrencyConflict,
  planActivityTransition,
  planCompleteActivity,
  planCreateActivity,
  planUpdateActivity,
  planCreatePromise,
  planUpdatePromise,
  planFollowUp,
  planPromiseTransition,
  type ActivityStatus,
  type ActivityWritePlan,
  type CompleteActivityRequest,
  type CreateActivityRequest,
  type UpdateActivityRequest,
  type CreatePromiseRequest,
  type UpdatePromiseRequest,
  type OperationRefusal,
  type OperationResult,
  type PtpStatus,
  type RowVersion,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, NAVIGATION_PROPERTIES, bindLookup } from '../data/schema.js';

/**
 * The service that turns a decision into a write.
 *
 * Three layers, and the split is the point. `@dcp/domain` decides *whether* and *what* in canonical
 * terms it can be tested on without a platform. This file translates that decision into Dataverse
 * terms — physical column names and `@odata.bind` navigation properties. The adapter speaks HTTP.
 *
 * A React component calls `createActivity(...)`. It never sees a column name, never composes a
 * binding, and never learns that `notes` is stored in the activity base `description` — so the same
 * component runs against on-premise, where the transport differs and the columns do not.
 *
 * **Every outcome here is a value, not an exception.** A refusal is data the form renders next to a
 * field; a conflict is a distinct outcome the form turns into "reload"; only a genuine transport
 * failure throws. Collapsing those three into one `catch` is what produces a retry button that
 * cannot succeed.
 */

/**
 * Canonical name → physical column.
 *
 * The map exists so the translation happens **once**. Two entries are worth reading twice:
 * `notes` is the activity-base `description`, not a `qdb_` column — `msst_notes` was refactored onto
 * the base attribute during the schema migration — and `activityDate`/`followUpDate` are ordinary
 * date-times, unlike `qdb_firstarreardate`, which is a DateOnly and rejects a timestamp (KI-62).
 */
const COLUMN_NAMES: Readonly<Record<string, string>> = {
  subject: 'subject',
  notes: 'description',
  activityDate: 'qdb_activitydate',
  followUpDate: 'qdb_followupdate',
  statuscode: 'statuscode',
  statecode: 'statecode',
  ptpDate: 'qdb_ptpdate',
  ptpStatus: 'qdb_ptpstatus',
  promisedAmount: 'qdb_promisedamount',
  promiseType: 'qdb_promisetype',
  amountReceived: 'qdb_amountreceived',
  paymentReceivedDate: 'qdb_paymentreceiveddate',
  brokenDate: 'qdb_brokendate',
  brokenReason: 'qdb_brokenreason',
};

interface LookupTarget {
  navigationProperty: string;
  entitySet: string;
}

/**
 * Which navigation property and target set each planned bind resolves to.
 *
 * Typed by the plan's own union, so a lookup added to the domain without a target here is a compile
 * error rather than a runtime `undefined` that would produce a payload missing its binding.
 */
const BIND_TARGETS: Readonly<Record<ActivityWritePlan['binds'][number]['lookup'], LookupTarget>> = {
  case: { navigationProperty: NAVIGATION_PROPERTIES.activityToCase, entitySet: ENTITY_SETS.collectionCase },
  type: { navigationProperty: NAVIGATION_PROPERTIES.activityToType, entitySet: ENTITY_SETS.collectionActivityType },
  outcome: { navigationProperty: NAVIGATION_PROPERTIES.activityToOutcome, entitySet: ENTITY_SETS.activityOutcome },
};

/** What a save can be. Three outcomes, because the form has three things to say. */
export type SaveOutcome<T> =
  | { status: 'saved'; result: T }
  | { status: 'refused'; refusals: readonly OperationRefusal[] }
  | { status: 'conflict'; message: string };

export interface ActivitySaved {
  id: string;
  /** `false` when the record already existed — a repeat submission, which is still a success. */
  created: boolean;
}

export interface ActivityUpdated {
  /**
   * The version **after** the write, which the caller must keep.
   *
   * Retaining the old one turns the user's next legitimate save into a spurious conflict, and the
   * platform only supplies this because every write asks for `return=representation` (KI-70).
   */
  version: RowVersion;
}

/**
 * Translates a plan's canonical fields and binds into a Dataverse payload.
 *
 * A name absent from `COLUMN_NAMES` is a programming error, not a value to pass through: sending an
 * unmapped name would be rejected by the platform with a message about an undeclared property, which
 * is a slow way to learn about a typo. It fails here instead, naming the field.
 */
export function toDataversePayload(plan: ActivityWritePlan): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(plan.fields)) {
    const column = COLUMN_NAMES[name];
    if (!column) throw new Error(`No column is mapped for the field "${name}".`);
    payload[column] = value;
  }

  for (const bind of plan.binds) {
    const target = BIND_TARGETS[bind.lookup];
    Object.assign(payload, bindLookup(target.navigationProperty, target.entitySet, bind.id));
  }
  return payload;
}

/**
 * The operations, wired.
 *
 * Constructed with an adapter rather than constructing one, so a test drives the same service the
 * browser does. Each method is the same four steps: plan, refuse or translate, write, report.
 */
export class ActivityService {
  constructor(private readonly adapter: XrmCrmAdapter) {}

  /**
   * Creates an activity at an id the **caller** chose.
   *
   * The id is the idempotency key, and it has to come from outside: generated here, every retry
   * would mint a fresh one and the guard would protect nothing. A form generates one when it opens.
   */
  async createActivity(id: string, request: CreateActivityRequest): Promise<SaveOutcome<ActivitySaved>> {
    return this.create(id, planCreateActivity(request));
  }

  /** Creates a promise to pay — the same entity, carrying promise columns. Never a second table. */
  async createPromise(id: string, request: CreatePromiseRequest): Promise<SaveOutcome<ActivitySaved>> {
    return this.create(id, planCreatePromise(request));
  }

  /** Edits the permitted fields of an activity still being worked. */
  async updateActivity(
    reference: { id: string; version: RowVersion },
    request: UpdateActivityRequest,
  ): Promise<SaveOutcome<ActivityUpdated>> {
    return this.update(reference, planUpdateActivity(request));
  }

  async completeActivity(
    reference: { id: string; version: RowVersion },
    request: CompleteActivityRequest,
  ): Promise<SaveOutcome<ActivityUpdated>> {
    return this.update(reference, planCompleteActivity(request));
  }

  /** Re-agrees the terms of an outstanding promise. Settled promises are refused by the domain. */
  async updatePromise(
    reference: { id: string; version: RowVersion },
    request: UpdatePromiseRequest,
  ): Promise<SaveOutcome<ActivityUpdated>> {
    return this.update(reference, planUpdatePromise(request));
  }

  async moveActivity(
    reference: { id: string; version: RowVersion },
    from: ActivityStatus,
    to: ActivityStatus,
  ): Promise<SaveOutcome<ActivityUpdated>> {
    return this.update(reference, planActivityTransition(from, to));
  }

  async scheduleFollowUp(
    reference: { id: string; version: RowVersion },
    currentStatus: ActivityStatus,
    followUpDate: string | undefined,
  ): Promise<SaveOutcome<ActivityUpdated>> {
    return this.update(reference, planFollowUp(currentStatus, followUpDate));
  }

  async movePromise(
    reference: { id: string; version: RowVersion },
    from: PtpStatus,
    to: PtpStatus,
    reported?: { amountReceived?: number; paymentDate?: string; brokenReason?: string },
  ): Promise<SaveOutcome<ActivityUpdated>> {
    return this.update(reference, planPromiseTransition(from, to, reported));
  }

  private async create(
    id: string,
    planned: OperationResult<ActivityWritePlan>,
  ): Promise<SaveOutcome<ActivitySaved>> {
    if (!planned.ok) return { status: 'refused', refusals: planned.refusals };
    const result = await this.adapter.createIdempotent(
      ENTITY_SETS.collectionActivity, id, toDataversePayload(planned.plan),
    );
    return { status: 'saved', result: { id: result.id, created: result.created } };
  }

  private async update(
    reference: { id: string; version: RowVersion },
    planned: OperationResult<ActivityWritePlan>,
  ): Promise<SaveOutcome<ActivityUpdated>> {
    if (!planned.ok) return { status: 'refused', refusals: planned.refusals };
    try {
      const version = await this.adapter.updateVersioned(
        { entity: ENTITY_SETS.collectionActivity, id: reference.id },
        toDataversePayload(planned.plan),
        reference.version,
      );
      return { status: 'saved', result: { version } };
    } catch (error) {
      // Only a concurrency conflict is converted. Everything else — a lifecycle refusal from the
      // server plugin, an authorisation failure, a dropped connection — propagates as itself, so a
      // caller never mistakes "you may not do this" for "someone else edited it".
      if (!isConcurrencyConflict(error)) throw error;
      return {
        status: 'conflict',
        // Deliberately free of HTTP and ETag vocabulary: this string can reach a collector.
        message: 'Someone else changed this record while you were working on it. Reload it to see their changes, then try again.',
      };
    }
  }
}
