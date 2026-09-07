// In-CRM submission engine — ports the backend CrmSubmissionService mapping logic to direct
// Xrm.WebApi writes. Maps form values to entity attributes via the form's submissionMappings,
// creates the parent record, then child records linked by relationship, with rollback on error.
import type { FormDefinition, FormFieldValues, SubmissionMapping } from '@qdb/shared';
import { webApi, cleanGuid } from './xrmClient';
import { joinLookupRecordIds, readLookupRecordId, resolveEntitySetName, resolveLookupBinding, toBindingEntry, type LookupBinding } from './lookupBinding';

interface FieldInfo {
  schemaName: string;
  fieldType: string;
  lookupEntity?: string;
}

// Values are keyed by schemaName (the renderer's convention), so resolve fieldId -> field info.
function indexFields(form: FormDefinition): Map<string, FieldInfo> {
  const index = new Map<string, FieldInfo>();
  for (const tab of form.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        index.set(field.id, {
          schemaName: field.schemaName,
          fieldType: field.fieldType,
          lookupEntity: field.lookupConfig?.entityLogicalName,
        });
      }
    }
  }
  return index;
}

function applyTransform(value: unknown, expression?: string): unknown {
  switch (expression) {
    case 'uppercase': return String(value).toUpperCase();
    case 'lowercase': return String(value).toLowerCase();
    case 'trim': return String(value).trim();
    case 'toString': return String(value);
    case 'toJson': return typeof value === 'string' ? value : JSON.stringify(value);
    default: return value;
  }
}

function normalizeFileRefs(value: unknown): unknown {
  if (Array.isArray(value) && value.length > 0
      && typeof value[0] === 'object' && value[0] !== null && 'fileId' in (value[0] as object)) {
    return (value as Array<{ fileId: string }>).map((ref) => ref.fileId);
  }
  return value;
}

/**
 * Resolves a binding for every mapping whose source field is a single lookup, once per
 * submission. Doing it up front keeps buildPayload synchronous, and a form with no lookup
 * mappings makes no metadata calls at all.
 */
async function resolveBindings(
  mappings: SubmissionMapping[],
  fields: Map<string, FieldInfo>,
): Promise<Map<string, LookupBinding>> {
  const bindings = new Map<string, LookupBinding>();

  for (const mapping of mappings) {
    const field = fields.get(mapping.fieldId);
    if (field?.fieldType !== 'lookup' || !field.lookupEntity) continue;
    if (bindings.has(mapping.targetAttributeLogicalName)) continue;

    // A mapping may pin either half of the binding — used where metadata cannot be read,
    // or where the value must be explicit for review. Anything blank is resolved.
    const pinnedProperty = mapping.targetNavigationProperty?.trim();
    const pinnedSet = mapping.targetEntitySetName?.trim();
    if (pinnedProperty && pinnedSet) {
      bindings.set(mapping.targetAttributeLogicalName, {
        navigationProperty: pinnedProperty, entitySetName: pinnedSet,
      });
      continue;
    }

    const binding = await resolveLookupBinding(
      mapping.targetEntityLogicalName,
      mapping.targetAttributeLogicalName,
      field.lookupEntity,
    );
    if (!binding) continue;

    bindings.set(mapping.targetAttributeLogicalName, {
      navigationProperty: pinnedProperty || binding.navigationProperty,
      entitySetName: pinnedSet || binding.entitySetName,
    });
  }

  return bindings;
}

function buildPayload(
  mappings: SubmissionMapping[],
  values: FormFieldValues,
  fields: Map<string, FieldInfo>,
  bindings: Map<string, LookupBinding>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const mapping of mappings) {
    const field = fields.get(mapping.fieldId);
    if (!field) continue;

    const raw = (values as Record<string, unknown>)[field.schemaName];
    if (raw === undefined || raw === null || raw === '') continue;

    // A lookup is written as a navigation binding, never as a raw attribute value. Both
    // names come from metadata: the navigation property is not always the column name, and
    // for a polymorphic lookup there is one per target.
    // A selection arrives as { id, displayName } from the renderer, or a bare GUID when a
    // caller supplies one — both bind.
    const binding = bindings.get(mapping.targetAttributeLogicalName);
    const recordId = binding ? readLookupRecordId(raw) : null;
    if (binding && recordId) {
      const [key, reference] = toBindingEntry(binding, cleanGuid(recordId));
      payload[key] = reference;
      continue;
    }

    // A multi-lookup selection is a list of references, which no single attribute can hold
    // as-is; it is stored as delimited record ids in the mapped text column (DFE-FBE-002),
    // matching the portal. An empty selection writes nothing.
    const joinedIds = joinLookupRecordIds(raw);
    if (joinedIds !== null) {
      payload[mapping.targetAttributeLogicalName] = joinedIds;
      continue;
    }
    if (Array.isArray(raw) && raw.length === 0) continue;

    payload[mapping.targetAttributeLogicalName] = applyTransform(normalizeFileRefs(raw), mapping.transformExpression);
  }
  return payload;
}

function groupChildMappings(mappings: SubmissionMapping[]): Map<string, SubmissionMapping[]> {
  const groups = new Map<string, SubmissionMapping[]>();
  for (const mapping of mappings) {
    const key = `${mapping.targetEntityLogicalName}:${mapping.childEntityRelationshipName ?? ''}`;
    const existing = groups.get(key) ?? [];
    existing.push(mapping);
    groups.set(key, existing);
  }
  return groups;
}

/** Upper bound on child records one grid may create — see CrmSubmissionService. */
const MAX_GRID_CHILD_ROWS = 250;

/**
 * One child record per entry-grid row. Grouping keeps the grid field as well as the target,
 * since two grids on one form may write to the same child table.
 */
async function createGridChildRecords(
  mappings: SubmissionMapping[],
  values: FormFieldValues,
  fields: Map<string, FieldInfo>,
  parentReference: string,
): Promise<Array<{ entity: string; id: string }>> {
  const created: Array<{ entity: string; id: string }> = [];
  if (mappings.length === 0) return created;

  const groups = new Map<string, SubmissionMapping[]>();
  for (const mapping of mappings) {
    const key = `${mapping.fieldId}:${mapping.targetEntityLogicalName}:${mapping.childEntityRelationshipName ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), mapping]);
  }

  for (const [key, groupMappings] of groups) {
    const [gridFieldId, childEntity, relationship] = key.split(':');

    const rows = values[fields.get(gridFieldId)?.schemaName ?? ''];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    if (rows.length > MAX_GRID_CHILD_ROWS) {
      throw new Error(`This grid has ${rows.length} rows, exceeding the limit of ${MAX_GRID_CHILD_ROWS}.`);
    }

    for (const row of rows) {
      const payload = buildGridRowPayload(groupMappings, row);
      // A row mapping to nothing would create a blank child record.
      if (Object.keys(payload).length === 0) continue;

      if (relationship) payload[`${relationship}@odata.bind`] = parentReference;
      const child = await webApi().createRecord(childEntity, payload);
      created.push({ entity: childEntity, id: child.id });
    }
  }

  return created;
}

/** The payload for one grid row: each mapping reads its own column out of the row. */
function buildGridRowPayload(
  mappings: SubmissionMapping[],
  row: unknown,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (typeof row !== 'object' || row === null) return payload;

  const cells = row as Record<string, unknown>;

  for (const mapping of mappings) {
    const value = cells[mapping.gridColumnAttribute!];
    if (value === undefined || value === null || value === '') continue;

    // A grid column is not a form field, so the metadata pass never saw it — a lookup
    // column binds only from the mapping's own override columns.
    const pinnedProperty = mapping.targetNavigationProperty?.trim();
    const pinnedSet = mapping.targetEntitySetName?.trim();
    const recordId = readLookupRecordId(value);

    if (pinnedProperty && pinnedSet && recordId) {
      const [bindKey, reference] = toBindingEntry(
        { navigationProperty: pinnedProperty, entitySetName: pinnedSet }, recordId,
      );
      payload[bindKey] = reference;
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value) && 'id' in (value as object)) {
      throw new Error(
        `Grid column '${mapping.gridColumnAttribute}' writes to lookup `
        + `'${mapping.targetAttributeLogicalName}' but no binding is configured. Set `
        + 'Target Navigation Property and Target Entity Set Name on the mapping.',
      );
    }

    payload[mapping.targetAttributeLogicalName] = value;
  }

  return payload;
}

async function resolveReferenceNumber(
  refAttribute: string | undefined,
  entityName: string,
  recordId: string,
): Promise<string> {
  if (!refAttribute) return cleanGuid(recordId).substring(0, 8).toUpperCase();
  try {
    const record = await webApi().retrieveRecord(entityName, recordId, `?$select=${refAttribute}`);
    const value = record[refAttribute];
    return value != null ? String(value) : cleanGuid(recordId).substring(0, 8).toUpperCase();
  } catch {
    return cleanGuid(recordId).substring(0, 8).toUpperCase();
  }
}

/** Submits the filled form and returns the reference number. Rolls back on any failure. */
export async function submitForm(form: FormDefinition, values: FormFieldValues): Promise<string> {
  const fields = indexFields(form);
  const active = form.submissionMappings.filter((m) => m.isActive);
  const parentMappings = active.filter((m) => !m.isMappedToChildEntity);

  const parentEntity = parentMappings[0]?.targetEntityLogicalName;
  if (!parentEntity) throw new Error('This form has no parent-entity submission mapping configured.');

  // Resolved once for the whole submission, parent and children together.
  const bindings = await resolveBindings(active, fields);

  const created: Array<{ entity: string; id: string }> = [];
  try {
    const parentPayload = buildPayload(parentMappings, values, fields, bindings);
    const parent = await webApi().createRecord(parentEntity, parentPayload);
    created.push({ entity: parentEntity, id: parent.id });

    // The set name comes from metadata, never from appending "s" — it is wrong for
    // opportunity -> opportunities and for 290 custom tables in this org.
    const parentSet = await resolveEntitySetName(parentEntity) ?? `${parentEntity}s`;
    const parentReference = `/${parentSet}(${parent.id})`;

    const childMappings = active.filter((m) => m.isMappedToChildEntity);

    // A mapping naming a grid column writes one child PER ROW; the rest keep the original
    // one-child-per-group behaviour. Mirrors CrmSubmissionService.
    const childGroups = groupChildMappings(childMappings.filter((m) => !m.gridColumnAttribute));
    for (const [key, mappings] of childGroups) {
      const [childEntity, relationship] = key.split(':');
      const childPayload = buildPayload(mappings, values, fields, bindings);
      if (relationship) childPayload[`${relationship}@odata.bind`] = parentReference;

      const child = await webApi().createRecord(childEntity, childPayload);
      created.push({ entity: childEntity, id: child.id });
    }

    for (const record of await createGridChildRecords(
      childMappings.filter((m) => m.gridColumnAttribute), values, fields, parentReference,
    )) {
      created.push(record);
    }

    return await resolveReferenceNumber(form.confirmationRecordRefAttribute, parentEntity, parent.id);
  } catch (error) {
    // Best-effort rollback in reverse creation order.
    for (const record of created.reverse()) {
      await webApi().deleteRecord(record.entity, record.id).catch(() => undefined);
    }
    throw error;
  }
}
