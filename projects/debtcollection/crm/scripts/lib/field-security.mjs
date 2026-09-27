/**
 * field-security.mjs
 * Provisions the "Msst DCP View Sensitive PII" field security profile and
 * assigns it to the PII columns on msst_dcpcustomer (msst_mobile, msst_email,
 * msst_address). FR-114 — PII masking enforced at the platform level.
 *
 * Limitation (see PROVISIONING.md):
 * Assigning the field security profile to security roles requires a
 * SystemUserRoles-like linkage that is not straightforward via Web API alone.
 * After script completion, an admin must assign the profile to the appropriate
 * roles in the CRM Security UI (Settings → Security → Field Security Profiles).
 */
import { apiGet, apiPost } from './crm-client.mjs';
import { addToSolution, COMPONENT_TYPE } from './solution.mjs';

const PROFILE_NAME = 'Msst DCP View Sensitive PII';

/**
 * Returns the fieldsecurityprofileid for the profile, or null if not found.
 * @param {object} cfg @param {string} token @param {string} solutionName
 */
export async function getFieldSecProfileId(cfg, token, solutionName) {
  const result = await apiGet(cfg, token, solutionName,
    `/fieldsecurityprofiles?$filter=name eq '${PROFILE_NAME}'&$select=fieldsecurityprofileid`);
  return result?.value?.[0]?.fieldsecurityprofileid ?? null;
}

/**
 * Creates the field security profile if it does not exist.
 * Returns the profile id.
 * @param {object} cfg @param {string} token @param {string} solutionName
 */
export async function ensureFieldSecProfile(cfg, token, solutionName) {
  const existingId = await getFieldSecProfileId(cfg, token, solutionName);
  if (existingId) {
    console.log(`  [SKIP] Field security profile ${PROFILE_NAME}`);
    return existingId;
  }
  const { entityId } = await apiPost(cfg, token, solutionName, '/fieldsecurityprofiles', {
    name:        PROFILE_NAME,
    description: 'Grants full read/create/update access to PII columns (msst_mobile, msst_email, msst_address). FR-114.',
  });
  const profileId = entityId ?? await getFieldSecProfileId(cfg, token, solutionName);
  if (profileId) {
    await addToSolution(cfg, token, solutionName, profileId, COMPONENT_TYPE.FIELD_SEC_PROFILE);
  }
  console.log(`  [CREATED] Field security profile ${PROFILE_NAME}`);
  return profileId;
}

/**
 * Creates a fieldpermission record linking the profile to a specific column.
 * Idempotent — checks for existence first.
 * canread/cancreate/canupdate: 4 = allowed, 1 = not allowed by default (0 = inherit)
 *
 * Note: fieldsecurityprofileid is a navigation property (entity reference).
 * The underlying lookup column for OData filter is _fieldsecurityprofileid_value.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} profileId @param {string} entityName @param {string} attributeLogicalName
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureFieldPermission(cfg, token, solutionName, profileId, entityName, attributeLogicalName) {
  const existing = await apiGet(cfg, token, solutionName,
    `/fieldpermissions?$filter=_fieldsecurityprofileid_value eq ${profileId} and entityname eq '${entityName}' and attributelogicalname eq '${attributeLogicalName}'&$select=fieldpermissionid`);
  if (existing?.value?.length) {
    console.log(`  [SKIP] Field permission ${entityName}.${attributeLogicalName}`);
    return 'skipped';
  }
  await apiPost(cfg, token, solutionName, '/fieldpermissions', {
    'fieldsecurityprofileid@odata.bind': `/fieldsecurityprofiles(${profileId})`,
    entityname:            entityName,
    attributelogicalname:  attributeLogicalName,
    canread:    4,
    cancreate:  4,
    canupdate:  4,
  });
  console.log(`  [CREATED] Field permission ${entityName}.${attributeLogicalName}`);
  return 'created';
}
