/**
 * DFE-RULES-002 item 7 — adds option 100000002 "Rating" to qdb_form_field.qdb_radio_render_style,
 * then publishes qdb_form_field. Idempotent: an org that already has the option is left alone.
 *
 * Live schema change — run only with explicit go-ahead.
 *   node --env-file=scripts/.env scripts/provision-rating-render-style.mjs
 *
 * On-prem cannot run this (client-credentials auth). Add the option by hand instead:
 * Customizations > qdb_form_field > qdb_radio_render_style > add "Rating", value 100000002.
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const ENTITY = 'qdb_form_field';
const ATTRIBUTE = 'qdb_radio_render_style';
const RATING_VALUE = 100000002;
const RATING_LABEL = 'Rating';
const LANGUAGE_CODE = 1033;

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? 'token failed');
  return json.access_token;
}

async function call(headers, method, path, body) {
  const res = await fetch(`${API}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function readOptionSet(headers) {
  const path = `EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${ATTRIBUTE}')`
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Name,IsGlobal,Options)';
  return (await call(headers, 'GET', path)).OptionSet;
}

async function run() {
  const headers = {
    Authorization: `Bearer ${await token()}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
  };
  const optionSet = await readOptionSet(headers);
  if (optionSet.Options.some((option) => option.Value === RATING_VALUE)) {
    console.log(`${ENTITY}.${ATTRIBUTE} already has ${RATING_VALUE}; nothing to do.`);
    return;
  }

  const target = optionSet.IsGlobal
    ? { OptionSetName: optionSet.Name }
    : { EntityLogicalName: ENTITY, AttributeLogicalName: ATTRIBUTE };
  await call(headers, 'POST', 'InsertOptionValue', {
    ...target,
    Value: RATING_VALUE,
    Label: { LocalizedLabels: [{ Label: RATING_LABEL, LanguageCode: LANGUAGE_CODE }] },
  });
  await call(headers, 'POST', 'PublishXml', {
    ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`,
  });

  const after = await readOptionSet(headers);
  const added = after.Options.some((option) => option.Value === RATING_VALUE);
  console.log(added ? `added ${RATING_VALUE} "${RATING_LABEL}" and published` : 'FAILED: option not present after insert');
  process.exit(added ? 0 : 1);
}

run().catch((error) => { console.error(error.message); process.exit(1); });
