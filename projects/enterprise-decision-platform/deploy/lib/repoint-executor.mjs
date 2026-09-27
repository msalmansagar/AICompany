// Applies metadata creates and registration moves one item at a time, writing a change-log
// entry for each. It stops at the first failure: a partially migrated org is a supported
// state (the planner classifies it), a half-understood one is not.
//
// There is no delete anywhere in this module. Rollback moves bindings back; it never removes
// a registration, a parameter, or execution evidence.

import { toCreateRequest } from './metadata-plan.mjs';

const BIND = {
  customapi: (item) => ({ path: `customapis(${item.id})`, body: { 'PluginTypeId@odata.bind': `/plugintypes(${item.targetTypeId})` } }),
  step: (item) => ({ path: `sdkmessageprocessingsteps(${item.id})`, body: { 'eventhandler_plugintype@odata.bind': `/plugintypes(${item.targetTypeId})` } }),
};

/** Create each missing Custom API parameter/property. Answers the entries it logged. */
export async function applyMetadataCreates(client, creates, changeLog) {
  for (const create of creates) {
    const { entitySet, body } = toCreateRequest(create);
    const entry = { phase: 'metadata', operation: create.operation, direction: create.direction, name: create.name, type: create.definition.type };
    try {
      await client.post(entitySet, body);
      changeLog.record({ ...entry, result: 'created' });
    } catch (error) {
      changeLog.record({ ...entry, result: 'failed', error: error.message });
      throw error;
    }
  }
}

/** Re-bind every planned item whose action is 'move'. Stops at the first failure. */
export async function applyMoves(client, plan, changeLog, phase) {
  for (const item of plan.filter((p) => p.action === 'move')) {
    const { path, body } = BIND[item.kind](item);
    const entry = { phase, kind: item.kind, id: item.id, key: item.key, fromPluginTypeId: item.currentTypeId, toPluginTypeId: item.targetTypeId };
    try {
      await client.patch(path, body);
      changeLog.record({ ...entry, result: 'moved' });
    } catch (error) {
      changeLog.record({ ...entry, result: 'failed', error: error.message });
      throw error;
    }
  }
}

/** Answer the items whose live binding differs from the target in `plan`. */
export function findUnverifiedItems(plan, freshItems) {
  const liveById = new Map(freshItems.map((item) => [item.id, item.currentTypeId]));
  return plan.filter((p) => p.targetTypeId && liveById.get(p.id) !== p.targetTypeId)
    .map((p) => ({ key: p.key, expected: p.targetTypeId, actual: liveById.get(p.id) ?? 'missing' }));
}

/** An append-only change log: an in-memory list plus an optional sink (a JSONL file). */
export function createChangeLog(sink = () => {}) {
  const entries = [];
  return {
    entries,
    record(entry) {
      const stamped = { at: new Date().toISOString(), ...entry };
      entries.push(stamped);
      sink(stamped);
    },
  };
}
