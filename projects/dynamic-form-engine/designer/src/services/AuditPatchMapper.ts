/**
 * AuditPatchMapper — ENT-005 (DFE-ENH-001 Phase 1, Workstream E3)
 *
 * Pure function that converts immer `produceWithPatches()` output into audit
 * rows ready to be written to `qdb_dfe_audit_log` in Dataverse.
 *
 * Designed to be called at the save boundary (AutosaveQueue.flush) after a
 * successful 204 response from Dataverse. The rows are written in the same
 * OData $batch as the form PATCH so that audit entries never exist without
 * a corresponding form change (atomicity).
 *
 * This function does NOT perform any I/O. Pass the result to the Dataverse
 * write layer. The save-boundary wiring (integration with Workstream A's
 * AutosaveQueue) is performed in FormSaveService / useSopSave — not here.
 *
 * Dependencies: immer (already in the stack — enablePatches() must be called
 * once at app initialisation before produceWithPatches is used).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single immer JSON-Patch-style operation.
 * Matches the Patch interface exported from immer's public API.
 */
export interface ImmerPatch {
  op: 'add' | 'remove' | 'replace';
  path: ReadonlyArray<string | number>;
  value?: unknown;
}

/** High-level classification of what changed, stored as qdb_event_type. */
export type AuditEventType =
  | 'FieldChange'
  | 'RuleChange'
  | 'MappingChange'
  | 'TranslationChange'
  | 'FormChange';

/** DFE action classification stored as qdb_action. */
export type AuditAction = 'create' | 'update' | 'delete';

/**
 * One audit row ready to be POSTed to qdb_dfe_audit_log.
 * All string fields match the entity column logical names from the arch doc.
 */
export interface AuditEntry {
  /** GUID of the qdb_form_definition record. */
  formId: string;
  /** GUID of the qdb_form_version record; null for pre-version-history saves. */
  formVersionId: string | null;
  /**
   * The schemaName of the field that changed.
   * Populated when path[0] === 'fields'; empty string for form-level changes.
   */
  fieldSchemaName: string;
  /** JSON Pointer path of the change, e.g. /fields/loan_amount/validationRules/0 */
  changePath: string;
  /** JSON-serialized prior state; null for CREATE actions. */
  before: string | null;
  /** JSON-serialized new state; null for DELETE actions. */
  after: string | null;
  /** Derived from the immer patch.op. */
  action: AuditAction;
  /** High-level classification of the change. */
  eventType: AuditEventType;
  /** Dataverse systemuser GUID of the editor. */
  changedBy: string;
  /** ISO-8601 UTC timestamp, set at flush time. */
  changedOn: string;
}

/**
 * Contextual metadata available at the save boundary.
 * Caller resolves these values before invoking mapPatches.
 */
export interface AuditMetadata {
  formId: string;
  formVersionId: string | null;
  changedBy: string;
  changedOn: string;
}

// ---------------------------------------------------------------------------
// Path classification
// ---------------------------------------------------------------------------

const PATH_ROOT_TO_EVENT_TYPE: Readonly<Record<string, AuditEventType>> = {
  fields: 'FieldChange',
  validationRules: 'RuleChange',
  businessRules: 'RuleChange',
  submissionMappings: 'MappingChange',
  translations: 'TranslationChange',
};

function resolveEventType(pathRoot: string): AuditEventType {
  return PATH_ROOT_TO_EVENT_TYPE[pathRoot] ?? 'FormChange';
}

function resolveFieldSchemaName(patch: ImmerPatch): string {
  const pathRoot = String(patch.path[0] ?? '');
  if (pathRoot !== 'fields') return '';
  return String(patch.path[1] ?? '');
}

// ---------------------------------------------------------------------------
// Patch → AuditAction
// ---------------------------------------------------------------------------

const PATCH_OP_TO_ACTION: Readonly<Record<ImmerPatch['op'], AuditAction>> = {
  add: 'create',
  replace: 'update',
  remove: 'delete',
};

function resolveAction(patchOp: ImmerPatch['op']): AuditAction {
  return PATCH_OP_TO_ACTION[patchOp];
}

// ---------------------------------------------------------------------------
// Before / after extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the before-value from the inverse patch.
 * For a CREATE (add) operation there is no prior value, so null is returned.
 */
function extractBeforeValue(inversePatch: ImmerPatch, action: AuditAction): string | null {
  if (action === 'create') return null;
  return JSON.stringify(inversePatch.value ?? null);
}

/**
 * Extracts the after-value from the forward patch.
 * For a DELETE (remove) operation there is no new value, so null is returned.
 */
function extractAfterValue(patch: ImmerPatch, action: AuditAction): string | null {
  if (action === 'delete') return null;
  return JSON.stringify(patch.value ?? null);
}

// ---------------------------------------------------------------------------
// JSON Pointer builder
// ---------------------------------------------------------------------------

/** Converts an immer path array to an RFC-6901 JSON Pointer string. */
function buildJsonPointer(path: ReadonlyArray<string | number>): string {
  if (path.length === 0) return '/';
  return '/' + path.map((segment) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
}

// ---------------------------------------------------------------------------
// Single patch mapper
// ---------------------------------------------------------------------------

function mapSinglePatch(
  patch: ImmerPatch,
  inversePatch: ImmerPatch,
  metadata: AuditMetadata,
): AuditEntry {
  const action = resolveAction(patch.op);
  const pathRoot = String(patch.path[0] ?? '');

  return {
    formId: metadata.formId,
    formVersionId: metadata.formVersionId,
    fieldSchemaName: resolveFieldSchemaName(patch),
    changePath: buildJsonPointer(patch.path),
    before: extractBeforeValue(inversePatch, action),
    after: extractAfterValue(patch, action),
    action,
    eventType: resolveEventType(pathRoot),
    changedBy: metadata.changedBy,
    changedOn: metadata.changedOn,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps immer patch output to audit rows for `qdb_dfe_audit_log`.
 *
 * Each element in `patches` corresponds to the element at the same index in
 * `inversePatches`. Both arrays are the exact output from immer's
 * `produceWithPatches(previousSnapshot, recipe)`.
 *
 * @param patches        Forward patches from produceWithPatches.
 * @param inversePatches Inverse patches from produceWithPatches (same length).
 * @param metadata       Save-boundary context: formId, changedBy, changedOn.
 * @returns              One AuditEntry per patch operation.
 */
export function mapPatches(
  patches: readonly ImmerPatch[],
  inversePatches: readonly ImmerPatch[],
  metadata: AuditMetadata,
): AuditEntry[] {
  if (patches.length !== inversePatches.length) {
    throw new Error(
      `AuditPatchMapper: patches length (${patches.length}) does not match ` +
      `inversePatches length (${inversePatches.length}). ` +
      'Both arrays must be the direct output of immer produceWithPatches().',
    );
  }

  return patches.map((patch, index) =>
    mapSinglePatch(patch, inversePatches[index], metadata),
  );
}
