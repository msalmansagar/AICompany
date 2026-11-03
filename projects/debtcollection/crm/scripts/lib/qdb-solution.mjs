/**
 * qdb-solution.mjs
 * QDB-publisher variants of the solution helpers, plus the Customer-lookup and generic
 * alternate-key helpers the `qdb_` schema needs.
 *
 * Deliberately a NEW module rather than an edit to `solution.mjs` / `alt-keys.mjs`: those are live
 * dependencies of the deployed `msst_` provisioning, and Phase 1 must not disturb what is running.
 *
 * Publisher confirmed by QDB 2026-09-17: uniquename `qdb`, customisation prefix `qdb`,
 * OptionValuePrefix 10000 — see docs/phases/Phase1_PreProvisioningSafetyCheck.md.
 */
import { apiGet, apiPost } from './crm-client.mjs';
import { label1033 } from './labels.mjs';

export const QDB_PUBLISHER_UNIQUE_NAME = 'qdb';
export const QDB_EXPECTED_OPTION_VALUE_PREFIX = 10000;

/**
 * Returns the publisherid for the confirmed QDB publisher, verifying its prefix and option-value
 * prefix against what the schema was authored for. An option set's integers are assigned from this
 * prefix at creation and cannot be rebased in place, so a mismatch must stop the run.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @returns {Promise<string>}
 */
export async function getQdbPublisherId(cfg, token, solutionName) {
  const result = await apiGet(
    cfg, token, solutionName,
    `/publishers?$filter=uniquename eq '${QDB_PUBLISHER_UNIQUE_NAME}'&$select=publisherid,customizationprefix,customizationoptionvalueprefix,friendlyname`,
  );
  const rows = result?.value ?? [];
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one publisher with uniquename '${QDB_PUBLISHER_UNIQUE_NAME}', found ${rows.length}`);
  }
  const pub = rows[0];
  if (pub.customizationprefix !== 'qdb') {
    throw new Error(`Publisher '${QDB_PUBLISHER_UNIQUE_NAME}' has prefix '${pub.customizationprefix}', expected 'qdb'`);
  }
  if (pub.customizationoptionvalueprefix !== QDB_EXPECTED_OPTION_VALUE_PREFIX) {
    throw new Error(
      `Publisher '${QDB_PUBLISHER_UNIQUE_NAME}' OptionValuePrefix is ${pub.customizationoptionvalueprefix}, ` +
      `but the schema was authored for ${QDB_EXPECTED_OPTION_VALUE_PREFIX}. Option values cannot be rebased ` +
      `in place — stop and reconcile before provisioning.`,
    );
  }
  console.log(`  Publisher: ${pub.uniquename ?? QDB_PUBLISHER_UNIQUE_NAME} "${pub.friendlyname}" prefix=${pub.customizationprefix} optionValuePrefix=${pub.customizationoptionvalueprefix}`);
  return pub.publisherid;
}

/**
 * Creates the DCP solution under the QDB publisher if absent.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} publisherId
 * @returns {Promise<string>}
 */
export async function ensureQdbSolution(cfg, token, solutionName, publisherId) {
  // Deliberately NOT using apiGet/apiPost here: the shared client stamps
  // `MSCRM.SolutionUniqueName: <solutionName>` on every request, and the platform rejects a header
  // naming a solution that does not exist yet — so the call that creates the solution cannot carry it.
  // ("The given solution unique name (…) is not valid", 0x80040217.)
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
  };

  const lookup = await fetch(
    `${cfg.apiBase}/solutions?$filter=uniquename eq '${solutionName}'&$select=solutionid,friendlyname`,
    { headers: baseHeaders },
  );
  if (lookup.ok) {
    const found = await lookup.json();
    if (found?.value?.length) {
      console.log(`  [SKIP] Solution ${solutionName} already exists`);
      return found.value[0].solutionid;
    }
  }

  const res = await fetch(`${cfg.apiBase}/solutions`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      uniquename: solutionName,
      friendlyname: 'QDB Debt Collection Platform',
      version: '1.0.0.0',
      'publisherid@odata.bind': `/publishers(${publisherId})`,
    }),
  });
  if (!res.ok) throw new Error(`POST /solutions → ${res.status}: ${await res.text()}`);
  const location = res.headers.get('OData-EntityId') ?? '';
  const entityId = (location.match(/\(([^)]+)\)$/) ?? [])[1] ?? null;
  console.log(`  [CREATED] Solution ${solutionName} (${entityId})`);
  return entityId;
}

/**
 * Returns true if a lookup attribute already exists on an entity.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} entity @param {string} attribute
 */
async function attributeExists(cfg, token, solutionName, entity, attribute) {
  const path = `/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')?$select=LogicalName`;
  return (await apiGet(cfg, token, solutionName, path)) !== null;
}

/**
 * Creates a **Customer** lookup (targets contact AND account) via CreateCustomerRelationships.
 *
 * A Customer lookup is not an ordinary attribute: it is one logical column backed by two
 * relationships, and the platform only builds it through this action. This is what lets a single
 * `qdb_customerid` serve HL (contact) and BFD (account) with no branch in Collection logic.
 *
 * @param {object} cfg @param {string} token @param {string} solutionName @param {object} def
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureCustomerLookup(cfg, token, solutionName, def) {
  // The builder returns { action, body }; entity and column are inside the payload.
  const lookupLogical = def.body?.Lookup?.LogicalName;
  const referencing = def.body?.OneToManyRelationships?.[0]?.ReferencingEntity;
  if (!lookupLogical || !referencing) {
    throw new Error('Customer lookup definition is missing Lookup.LogicalName or ReferencingEntity');
  }
  if (await attributeExists(cfg, token, solutionName, referencing, lookupLogical)) {
    console.log(`  [SKIP] Customer lookup ${referencing}.${lookupLogical}`);
    return 'skipped';
  }
  await apiPost(cfg, token, solutionName, `/${def.action}`, def.body);
  console.log(`  [CREATED] Customer lookup ${referencing}.${lookupLogical} (contact + account)`);
  return 'created';
}

/**
 * Creates an alternate key on any entity if absent.
 * Keys are asynchronous on the platform: creation returns before the index is active.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {object} keyDef
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureAltKey(cfg, token, solutionName, keyDef) {
  const { entity, schemaName, displayName, attributes } = keyDef;
  const existing = await apiGet(cfg, token, solutionName, `/EntityDefinitions(LogicalName='${entity}')/Keys?$select=SchemaName`);
  if ((existing?.value ?? []).some(k => k.SchemaName === schemaName)) {
    console.log(`  [SKIP] Alternate key ${schemaName}`);
    return 'skipped';
  }
  await apiPost(cfg, token, solutionName, `/EntityDefinitions(LogicalName='${entity}')/Keys`, {
    SchemaName: schemaName,
    LogicalName: schemaName.toLowerCase(),
    DisplayName: label1033(displayName),
    KeyAttributes: attributes,
  });
  console.log(`  [CREATED] Alternate key ${schemaName} on ${entity}`);
  return 'created';
}
