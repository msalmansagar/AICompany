// Pure functions: classify an inventory against the contract, and derive a deterministic
// migration (or rollback) plan. No I/O here, so every refusal rule is unit-testable.

const ACTIVE = 'active';
const LEGACY = 'legacy';

/** Index the inventory's plugin types by side ('active' | 'legacy' | 'foreign') and type name. */
export function indexPluginTypes(inventory, contract) {
  const sideOfAssembly = new Map();
  for (const assembly of inventory.assemblies) {
    if (assembly.name === contract.runtime.active.assemblyName) sideOfAssembly.set(assembly.id, ACTIVE);
    if (assembly.name === contract.runtime.legacy.assemblyName) sideOfAssembly.set(assembly.id, LEGACY);
  }
  const byId = new Map(inventory.pluginTypes.map((t) => [t.id, { ...t, side: sideOfAssembly.get(t.assemblyId) ?? 'foreign' }]));
  const idFor = (side, typeName) => [...byId.values()].find((t) => t.side === side && t.typeName === typeName)?.id ?? null;
  return { byId, idFor };
}

/**
 * Classify every registration and list every reason the state is unsafe to change.
 * Answers { items, problems } where each item is a Custom API or entity step that may move.
 */
export function classifyRegistrations(inventory, contract) {
  const problems = [...assemblyProblems(inventory, contract)];
  const types = indexPluginTypes(inventory, contract);
  problems.push(...pluginTypeProblems(types, contract));
  const apiResult = classifyCustomApis(inventory, contract, types);
  const stepResult = classifyEntitySteps(inventory, contract, types);
  return { items: [...apiResult.items, ...stepResult.items], problems: [...problems, ...apiResult.problems, ...stepResult.problems] };
}

function assemblyProblems(inventory, contract) {
  const problems = [];
  for (const name of [contract.runtime.active.assemblyName, contract.runtime.legacy.assemblyName]) {
    const matches = inventory.assemblies.filter((a) => a.name === name);
    if (matches.length === 0) problems.push(`assembly '${name}' is not registered`);
    if (matches.length > 1) problems.push(`assembly '${name}' is registered ${matches.length} times`);
  }
  const active = inventory.assemblies.find((a) => a.name === contract.runtime.active.assemblyName);
  if (active && !active.packageId) problems.push(`active assembly '${active.name}' is not inside a plug-in package (ADR-18 requires the package model)`);
  return problems;
}

function pluginTypeProblems(types, contract) {
  const problems = [];
  for (const type of types.byId.values()) {
    if (type.side === 'foreign') problems.push(`plugin type ${type.typeName} (${type.id}) belongs to an assembly the contract does not name`);
  }
  for (const typeName of contract.pluginTypes) {
    if (!types.idFor(ACTIVE, typeName)) problems.push(`active assembly has no plugin type ${typeName}`);
  }
  return problems;
}

function classifyCustomApis(inventory, contract, types) {
  const items = [];
  const problems = [];
  for (const operation of contract.operations) {
    const api = inventory.customApis.find((a) => a.uniqueName === operation.uniqueName);
    if (!api) { problems.push(`Custom API ${operation.uniqueName} does not exist (A7 moves registrations; it does not create operations)`); continue; }
    const current = types.byId.get(api.pluginTypeId);
    if (!current || current.side === 'foreign') { problems.push(`Custom API ${api.uniqueName} is bound to an unknown plugin type ${api.pluginTypeId}`); continue; }
    if (current.typeName !== operation.pluginType) { problems.push(`Custom API ${api.uniqueName} is bound to ${current.typeName}, contract says ${operation.pluginType}`); continue; }
    items.push({ kind: 'customapi', id: api.id, key: api.uniqueName, typeName: current.typeName, currentTypeId: current.id, currentSide: current.side });
  }
  problems.push(...implementationStepProblems(inventory, contract));
  return { items, problems };
}

// A Custom API's stage-30 step is maintained by Dataverse and follows customapi.plugintypeid.
// If it ever disagrees with its API, the registration is corrupt and must not be touched.
function implementationStepProblems(inventory, contract) {
  const problems = [];
  const apiByName = new Map(inventory.customApis.map((a) => [a.uniqueName, a]));
  for (const step of inventory.steps.filter((s) => s.stage === 30)) {
    const api = apiByName.get(step.message);
    if (!api || !contract.operations.some((o) => o.uniqueName === step.message)) problems.push(`stage-30 step ${step.id} on '${step.message}' is not a contract operation`);
    else if (api.pluginTypeId !== step.eventHandlerId) problems.push(`implementation step of ${step.message} points at ${step.eventHandlerId} but the API points at ${api.pluginTypeId}`);
  }
  return problems;
}

function classifyEntitySteps(inventory, contract, types) {
  const items = [];
  const problems = [];
  const entitySteps = inventory.steps.filter((s) => s.stage !== 30);
  for (const expected of contract.entitySteps) {
    const matches = entitySteps.filter((s) => matchesExpectedStep(s, expected, types));
    if (matches.length === 0) { problems.push(`entity step ${describeStep(expected)} is not registered`); continue; }
    if (matches.length > 1) { problems.push(`entity step ${describeStep(expected)} is registered ${matches.length} times — it would run more than once`); continue; }
    const [step] = matches;
    if (step.imageCount !== expected.images.length) problems.push(`entity step ${describeStep(expected)} has ${step.imageCount} image(s), contract expects ${expected.images.length}`);
    if (step.disabled) problems.push(`entity step ${describeStep(expected)} is disabled`);
    const current = types.byId.get(step.eventHandlerId);
    items.push({ kind: 'step', id: step.id, key: describeStep(expected), typeName: expected.pluginType, currentTypeId: current.id, currentSide: current.side });
  }
  for (const step of entitySteps) {
    if (!contract.entitySteps.some((expected) => matchesExpectedStep(step, expected, types))) problems.push(`unexpected step ${step.id} (${step.message} on ${step.entity}, stage ${step.stage}) bound to an EDP plugin type`);
  }
  return { items, problems };
}

function matchesExpectedStep(step, expected, types) {
  const type = types.byId.get(step.eventHandlerId);
  return type?.typeName === expected.pluginType && step.message === expected.message && step.entity === expected.entity && step.stage === expected.stage && step.mode === expected.mode;
}

export function describeStep(step) {
  return `${step.message}/${step.entity}/stage${step.stage}/${step.pluginType.split('.').pop()}`;
}

/**
 * Plan moves so every item ends on `targetSide`. Items already there are listed as `unchanged`.
 * Order is deterministic: Custom APIs by name, then entity steps by key.
 */
export function planMoves(items, types, targetSide) {
  const ordered = [...items].sort((a, b) => (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === 'customapi' ? -1 : 1));
  return ordered.map((item) => {
    const targetTypeId = types.idFor(targetSide, item.typeName);
    if (item.currentTypeId === targetTypeId) return { ...item, action: 'unchanged', targetTypeId };
    return { ...item, action: 'move', targetTypeId };
  });
}

/** Plan a rollback to the exact bindings recorded in a snapshot, item by item. */
export function planRollback(items, snapshot) {
  const recorded = new Map([
    ...snapshot.customApis.map((a) => [a.id, a.pluginTypeId]),
    ...snapshot.steps.map((s) => [s.id, s.eventHandlerId]),
  ]);
  return [...items].sort((a, b) => a.key.localeCompare(b.key)).map((item) => {
    const targetTypeId = recorded.get(item.id);
    if (!targetTypeId) return { ...item, action: 'not-in-snapshot', targetTypeId: null };
    return { ...item, action: item.currentTypeId === targetTypeId ? 'unchanged' : 'move', targetTypeId };
  });
}

export const SIDES = Object.freeze({ ACTIVE, LEGACY });
