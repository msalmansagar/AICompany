import {
  type CollectionActivity,
  type CrmCallContext,
  type CrmRecord,
  type ICrmAdapter,
  type PtpStatus,
} from '@dcp/domain';
import {
  ACTIVITY,
  ACTIVITY_STATE_CODES,
  ACTIVITY_STATUS_CODES,
  ACTIVITY_TYPE,
  ENTITY_SETS,
  NAVIGATION,
  PROMISE_TYPE_VALUES,
  PTP_STATUS_CODES,
  bind,
} from './qdbBindings.js';

/**
 * Persists Collection Activities, promise to pay included. Activity types are reference data QDB
 * maintains and are matched by their code — never by a GUID compiled into this service.
 */
export class CollectionActivityRepository {
  constructor(private readonly crm: ICrmAdapter) {}

  /** Resolves an activity type by its code, or `null` when the organisation has no such type. */
  async findActivityTypeId(code: string, context: CrmCallContext = {}): Promise<string | null> {
    const found = await this.crm.retrieveByKey(ENTITY_SETS.collectionActivityType, { field: ACTIVITY_TYPE.code, value: code }, [ACTIVITY_TYPE.id], context);
    return found ? String(found[ACTIVITY_TYPE.id]) : null;
  }

  /** Creates the activity. Its statuscode is left to the plugin (DefaultStatusAssigner → Open, promise → Active). */
  async create(activity: CollectionActivity, activityTypeId: string, activityNumber: string, context: CrmCallContext = {}): Promise<string> {
    const optional = (column: string, value: unknown): CrmRecord => (value === undefined ? {} : { [column]: value });
    const values: CrmRecord = {
      [ACTIVITY.activityNumber]: activityNumber,
      [ACTIVITY.activityDate]: activity.activityDate,
      ...optional(ACTIVITY.subject, activity.subject),
      ...optional(ACTIVITY.followUpDate, activity.followUpDate),
      ...optional(ACTIVITY.amount, activity.amount),
      ...(activity.promise ? promiseValues(activity.promise) : {}),
      ...(activity.relatedRecord
        ? { [ACTIVITY.relatedRecordType]: activity.relatedRecord.entity, [ACTIVITY.relatedRecordId]: activity.relatedRecord.id }
        : {}),
      ...bind(NAVIGATION.activityType, ENTITY_SETS.collectionActivityType, activityTypeId),
      ...bind(NAVIGATION.activityCase, ENTITY_SETS.collectionCase, activity.caseId),
      ...bind(NAVIGATION.activityRegardingCase, ENTITY_SETS.collectionCase, activity.caseId),
      ...(activity.correlationId ? {} : {}),
    };
    return this.crm.create(ENTITY_SETS.collectionActivity, values, context);
  }

  /** Moves the promise lifecycle. The plugin validates the transition. */
  async updatePromiseStatus(activityId: string, to: PtpStatus, context: CrmCallContext = {}): Promise<void> {
    await this.crm.update({ entity: ENTITY_SETS.collectionActivity, id: activityId }, { [ACTIVITY.ptpStatus]: PTP_STATUS_CODES[to] }, context);
  }

  /** Completes the activity, after which the plugin makes it immutable. */
  async complete(activityId: string, context: CrmCallContext = {}): Promise<void> {
    await this.crm.update({ entity: ENTITY_SETS.collectionActivity, id: activityId }, {
      [ACTIVITY.stateCode]: ACTIVITY_STATE_CODES.Completed,
      [ACTIVITY.statusCode]: ACTIVITY_STATUS_CODES.Completed,
    }, context);
  }
}

function promiseValues(promise: NonNullable<CollectionActivity['promise']>): CrmRecord {
  return {
    [ACTIVITY.ptpDate]: promise.ptpDate,
    [ACTIVITY.promisedAmount]: promise.promisedAmount,
    ...(promise.promiseType ? { [ACTIVITY.promiseType]: PROMISE_TYPE_VALUES[promise.promiseType] } : {}),
    [ACTIVITY.ptpStatus]: PTP_STATUS_CODES[promise.status],
    ...(promise.amountReceived !== undefined ? { [ACTIVITY.amountReceived]: promise.amountReceived } : {}),
  };
}
