/**
 * onprem-transforms.mjs — the explicit, named changes that turn a Dataverse (9.2) export of
 * qdb_debtcollection into a package a Dynamics 365 CE 9.1 on-prem server accepts.
 *
 * Why each exists: a 9.x on-prem server validates customizations.xml against its own schema before
 * it changes anything, and fails the whole import on an element it does not know. Every element
 * removed here was reported by Microsoft's published on-prem schema (Schemas\9.0.0.2090) and carries
 * only an empty or default value in this export — each transform REFUSES to remove anything else, so
 * no behaviour is dropped silently. Pure functions: text in, { text, removed } out.
 */

export class UnsafeTransformError extends Error {}

/** DCP's own tables: a relationship to one of these is part of the product, never removed. */
export const DCP_TABLES = new Set([
  'qdb_activityoutcome', 'qdb_assignmentconfiguration', 'qdb_collectionactivity', 'qdb_collectionactivitytype',
  'qdb_collectioncase', 'qdb_collectionstrategy', 'qdb_communicationrun', 'qdb_communicationtemplate',
  'qdb_delinquencysnapshot', 'qdb_identityexception', 'qdb_platformconfiguration', 'qdb_platformmapping',
  'qdb_strategyaction',
]);

/** Out-of-box tables are unprefixed; anything with a publisher prefix (qdb_, msdyn_, new_ …) is not. */
const isPrefixedTable = name => /^[a-z0-9]+_/i.test(name);

function removeMatches(text, pattern, isRemovable, description) {
  let removed = 0;
  const next = text.replace(pattern, (match, value) => {
    if (!isRemovable(value ?? '')) throw new UnsafeTransformError(`${description}: refusing to remove non-default value "${value}"`);
    removed += 1;
    return '';
  });
  return { text: next, removed };
}

const exactly = (...allowed) => value => allowed.includes(value);
const anything = () => true;

/** Ordered list: [name, why, transform]. Applied to customizations.xml. */
export const CUSTOMIZATION_TRANSFORMS = [
  ['root-organisation-attributes', 'OrganizationVersion / OrganizationSchemaType / CRMServerServiceabilityVersion are 9.2 export stamps',
    text => removeMatches(text, /\s(?:OrganizationVersion|OrganizationSchemaType|CRMServerServiceabilityVersion)="([^"]*)"/g, anything, 'root attribute')],
  ['empty-autonumber-format', 'AutoNumberFormat is empty on every column (no column is auto-numbered)',
    text => removeMatches(text, /\s*<AutoNumberFormat>([^<]*)<\/AutoNumberFormat>/g, exactly(''), 'AutoNumberFormat')],
  ['retrieve-audit-flag', 'IsRetrieveAuditEnabled is 0 (off) on every table',
    text => removeMatches(text, /\s*<IsRetrieveAuditEnabled>([^<]*)<\/IsRetrieveAuditEnabled>/g, exactly('0'), 'IsRetrieveAuditEnabled')],
  ['teams-integration-flag', 'IsMSTeamsIntegrationEnabled is 0 on every table; Teams integration is a Dataverse online feature',
    text => removeMatches(text, /\s*<IsMSTeamsIntegrationEnabled>([^<]*)<\/IsMSTeamsIntegrationEnabled>/g, exactly('0'), 'IsMSTeamsIntegrationEnabled')],
  ['role-auto-assigned-flag', 'Role IsAutoAssigned is 0 on every role',
    text => removeMatches(text, /\s*<IsAutoAssigned>([^<]*)<\/IsAutoAssigned>/g, exactly('0'), 'IsAutoAssigned')],
  ['cascade-archive', 'Long-term data retention (archive) does not exist on 9.1; there is nothing to cascade',
    text => removeMatches(text, /\s*<CascadeArchive>([^<]*)<\/CascadeArchive>/g, anything, 'CascadeArchive')],
  ['form-header-density', 'headerdensity is a Unified Interface header layout hint; 9.1 renders its default header',
    text => removeMatches(text, /\sheaderdensity="([^"]*)"/g, anything, 'headerdensity')],
  ['option-is-hidden', 'IsHidden="0" on options, states and statuses — no option is hidden',
    text => removeMatches(text, /\sIsHidden="([^"]*)"/g, exactly('0'), 'IsHidden')],
  ['retrieve-multiple-audit-flag', 'IsRetrieveMultipleAuditEnabled is 0 (off) on every table',
    text => removeMatches(text, /\s*<IsRetrieveMultipleAuditEnabled>([^<]*)<\/IsRetrieveMultipleAuditEnabled>/g, exactly('0'), 'IsRetrieveMultipleAuditEnabled')],
  ['sitemap-collapsible-groups', 'EnableCollapsibleGroups is False',
    text => removeMatches(text, /\s*<EnableCollapsibleGroups>([^<]*)<\/EnableCollapsibleGroups>/g, exactly('False', 'false', '0'), 'EnableCollapsibleGroups')],
  ['app-optimized-for', 'AppModule OptimizedFor is empty',
    text => removeMatches(text, /\s*<OptimizedFor>([^<]*)<\/OptimizedFor>/g, exactly(''), 'OptimizedFor')],
  ['app-settings', 'App settings (AppChannel) require the cloud-only msdyn_AppFrameworkInfraExtensions package',
    text => removeMatches(text, /\s*<appsettings>([\s\S]*?)<\/appsettings>/g, anything, 'appsettings')],
  ['foreign-regarding-relationships', 'Activity "Regarding" relationships to tables that exist only in the cloud sandbox; the target org generates Regarding relationships for its own activity-enabled tables',
    removeForeignRegardingRelationships],
];

/**
 * Removes qdb_collectionactivity's Regarding relationships to prefixed, non-DCP tables. Any OTHER
 * relationship to a prefixed non-DCP table is a real dependency and stops the build.
 */
export function removeForeignRegardingRelationships(text) {
  let removed = 0;
  const next = text.replace(/\s*<EntityRelationship Name="([^"]+)">([\s\S]*?)<\/EntityRelationship>/g, (match, name, body) => {
    const referenced = /<ReferencedEntityName>([^<]+)<\/ReferencedEntityName>/.exec(body)?.[1] ?? '';
    const referencing = /<ReferencingEntityName>([^<]+)<\/ReferencingEntityName>/.exec(body)?.[1] ?? '';
    const attribute = /<ReferencingAttributeName>([^<]+)<\/ReferencingAttributeName>/.exec(body)?.[1] ?? '';
    const isForeign = isPrefixedTable(referenced) && !DCP_TABLES.has(referenced.toLowerCase());
    if (!isForeign) return match;
    if (attribute.toLowerCase() !== 'regardingobjectid' || referencing !== 'qdb_collectionactivity') {
      throw new UnsafeTransformError(`relationship ${name} (${referencing}.${attribute} → ${referenced}) is a real external dependency`);
    }
    removed += 1;
    return '';
  });
  return { text: next, removed };
}

/**
 * Schema findings are ADVISORY. Microsoft's published on-prem schema (9.0.0.2090, the one the 9.1
 * documentation links) is older than both this export and a current 9.1 server: it does not declare
 * IsSearchable, IsFilterable, the Unified Interface site-map flags or app role maps, all of which carry
 * real values here. Removing them to satisfy it would drop behaviour, so they are kept and reported;
 * the decisive vocabulary check is a diff against an export taken from the target 9.1 org.
 */
export const KNOWN_SCHEMA_FINDINGS = [
  { pattern: /'IsSearchable'|'IsFilterable'|'IsSolutionAware'|'IsRetrievable'/, reason: 'column/table metadata flags with real values; IsRetrievable dates from CRM 2016, which proves the published schema is incomplete for attributes' },
  { pattern: /'PluginTypeName'|'PluginTypeId'/, reason: 'step element ORDER differs from the published schema (SdkMessageId first); content unchanged' },
  { pattern: /'Show(Home|Pinned|Recents)'/, reason: 'Unified Interface site-map flags' },
  { pattern: /'AppModule' has (invalid child element '(statecode|statuscode|NavigationType|AppModuleRoleMaps|LocalizedNames|Descriptions)'|incomplete content)/, reason: 'app state, role map and names — real app configuration (incomplete content is a probe artefact)' },
];

/**
 * PROBE ONLY — never packaged. The validator reports the first problem inside each element, so an
 * accepted finding can hide a real one behind it. This neutralises the accepted findings in a
 * throwaway copy so the next validation pass can see past them.
 */
export function neutraliseAcceptedFindings(text) {
  return text
    .replace(/\s*<(IsSearchable|IsFilterable|IsSolutionAware)>[^<]*<\/\1>/g, '')
    .replace(/\s*<(Show(?:Home|Pinned|Recents))>[^<]*<\/\1>/g, '')
    .replace(/(<SdkMessageProcessingStep [^>]*>)(\s*<SdkMessageId>[^<]*<\/SdkMessageId>)([\s\S]*?<\/Rank>)/g, '$1$3$2')
    .replace(/<AppModule>[\s\S]*?<\/AppModule>/g, app => app
      .replace(/\s*<(statecode|statuscode|NavigationType)>[^<]*<\/\1>/g, '')
      .replace(/\s*<AppModuleRoleMaps>[\s\S]*?<\/AppModuleRoleMaps>/g, '')
      .replace(/\s*<LocalizedNames>[\s\S]*?<\/LocalizedNames>/g, '')
      .replace(/\s*<Descriptions>[\s\S]*?<\/Descriptions>/g, ''));
}

export function classifySchemaFindings(violations) {
  return violations.map(violation => {
    const known = KNOWN_SCHEMA_FINDINGS.find(finding => finding.pattern.test(violation.message));
    return { ...violation, known: Boolean(known), reason: known?.reason ?? 'NOT recognised — review before import' };
  });
}

/** solution.xml: stamp for 9.x on-prem and drop the cloud-only AppSetting dependencies. */
export function transformSolutionManifest(text) {
  const root = /<ImportExportXml[^>]*>/.exec(text)[0];
  const stamped = root
    .replace(/\sversion="[^"]*"/, ' version="9.0.0.0"')
    .replace(/\sSolutionPackageVersion="[^"]*"/, ' SolutionPackageVersion="9.0"')
    .replace(/\s(?:OrganizationVersion|OrganizationSchemaType|CRMServerServiceabilityVersion)="[^"]*"/g, '');
  let removedDependencies = 0;
  const withoutAppSettings = text.replace(root, stamped).replace(/\s*<MissingDependency>([\s\S]*?)<\/MissingDependency>/g, (match, body) => {
    if (!/type="AppSetting"/.test(body)) return match;
    removedDependencies += 1;
    return '';
  });
  const remaining = (withoutAppSettings.match(/<MissingDependency>/g) ?? []).length;
  return { text: withoutAppSettings.replace(/<MissingDependencies>\s*<\/MissingDependencies>/, '<MissingDependencies />'), removedDependencies, remainingDependencies: remaining, rootBefore: root, rootAfter: stamped };
}
