// In-CRM submission engine — ports the backend CrmSubmissionService mapping logic to direct
// Xrm.WebApi writes. Maps form values to entity attributes via the form's submissionMappings,
// creates the parent record, then child records linked by relationship, with rollback on error.
import type { FormDefinition, FormFieldValues, SubmissionMapping } from '@qdb/shared';
import { webApi, cleanGuid } from './xrmClient';
import { readLookupRecordId, resolveLookupBinding, toBindingEntry, type LookupBinding } from './lookupBinding';

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

    const binding = await resolveLookupBinding(
      mapping.targetEntityLogicalName,
      mapping.targetAttributeLogicalName,
      field.lookupEntity,
    );
    if (binding) bindings.set(mapping.targetAttributeLogicalName, binding);
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

    const childGroups = groupChildMappings(active.filter((m) => m.isMappedToChildEntity));
    for (const [key, mappings] of childGroups) {
      const [childEntity, relationship] = key.split(':');
      const childPayload = buildPayload(mappings, values, fields, bindings);
      if (relationship) childPayload[`${relationship}@odata.bind`] = `/${parentEntity}s(${parent.id})`;
      const child = await webApi().createRecord(childEntity, childPayload);
      created.push({ entity: childEntity, id: child.id });
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
