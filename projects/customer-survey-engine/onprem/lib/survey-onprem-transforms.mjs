/**
 * The named changes that turn a cloud (9.2) export of SurveyEngine into a package a Dynamics 365 CE
 * 9.1 on-prem server accepts (B9 item 3, readiness findings F3, F4, F10).
 *
 * The generic 9.2 → 9.1 transforms are adopted from the Debt Collection kit, which proved them on
 * HL CRM test (import 2, 2026-10-04); only its Regarding-relationship transform is left out, because
 * it is written for Debt Collection's own activity table. Every survey transform here refuses to
 * remove anything it does not recognise, so no behaviour is dropped silently. Pure functions: text
 * in, { text, removed } out.
 *
 * @module survey-onprem/transforms
 */
import {
  CUSTOMIZATION_TRANSFORMS as SHARED_TRANSFORMS, UnsafeTransformError, transformSolutionManifest,
} from '../../../debtcollection/crm/scripts/lib/onprem-transforms.mjs';

export { UnsafeTransformError };

const DEBT_COLLECTION_ONLY = new Set(['foreign-regarding-relationships']);
export const TRIGGER_PLUGIN_TYPE = 'Qdb.SurveyEngine.Plugins.SurveyTriggerPlugin';
// The platform's default app icon on the cloud org; an on-prem 9.1 org may not have it (F10).
export const PLATFORM_APP_ICON_ID = '953b9fac-1e5e-e611-80d6-00155ded156f';
export const APP_ICON_RESOURCE = 'qdb_icon_survey_setup';
// Out-of-box tables every CRM has; the cloud records them as dependencies on cloud-only solutions.
export const OUT_OF_BOX_TABLES = new Set(['account', 'contact', 'queue']);

const isSurveyTable = (name) => /^qdb_survey_/i.test(name);
const isPrefixedTable = (name) => /^[a-z0-9]+_/i.test(name);
const tag = (body, name) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1] ?? '';

/**
 * Removes the SurveyTriggerPlugin steps (F4). They name the cloud org's request tables; on-prem,
 * qdb_srv_ActivateSource creates each source's steps when an administrator activates it. Any other
 * step must be on a survey table, or the build stops.
 */
export function removeCloudTriggerSteps(text) {
  const removedIds = [];
  const next = text.replace(/\s*<SdkMessageProcessingStep Name="[^"]*" SdkMessageProcessingStepId="\{([^}]+)\}">([\s\S]*?)<\/SdkMessageProcessingStep>/g, (match, id, body) => {
    if (tag(body, 'PluginTypeName').startsWith(`${TRIGGER_PLUGIN_TYPE},`)) {
      removedIds.push(id.toLowerCase(), ...[...body.matchAll(/<SdkMessageProcessingStepImageId>\{([^}]+)\}<\/SdkMessageProcessingStepImageId>/g)].map((m) => m[1].toLowerCase()));
      return '';
    }
    const table = tag(body, 'PrimaryEntity');
    if (!isSurveyTable(table)) throw new UnsafeTransformError(`step ${id} runs on ${table}, which is not a survey table`);
    return match;
  });
  return { text: next, removed: removedIds.length, removedIds };
}

/** Points the app at the survey's own icon instead of the platform's default one (F10). */
export function useOwnAppIcon(text) {
  const iconId = new RegExp(`<WebResourceId>\\{?([0-9a-f-]{36})\\}?</WebResourceId>\\s*<Name>${APP_ICON_RESOURCE}</Name>`, 'i').exec(text)?.[1];
  if (!iconId) throw new UnsafeTransformError(`web resource ${APP_ICON_RESOURCE} is not in the export`);
  let changed = 0;
  const next = text.replace(/(<AppModule>[\s\S]*?<WebResourceId>)([^<]*)(<\/WebResourceId>)/g, (match, open, current, close) => {
    const currentId = current.replace(/[{}]/g, '').toLowerCase();
    if (currentId === iconId.toLowerCase()) return match;
    if (currentId !== PLATFORM_APP_ICON_ID) throw new UnsafeTransformError(`app icon ${current} is neither the platform default nor ${APP_ICON_RESOURCE}`);
    changed += 1;
    return `${open}${iconId.toLowerCase()}${close}`;
  });
  return { text: next, removed: changed };
}

/**
 * Removes the account, contact and queue shells. The survey adds nothing to them (its lookups belong
 * to its own tables), but the cloud export carries whatever else the cloud org holds on them: the
 * account shell brought the Report Engine's ribbon buttons, whose script is not in this kit. Without
 * the shells the import leaves those tables exactly as each org has them. A shell that carries
 * columns, forms or views is refused, because then the survey would need it.
 */
export function removeOutOfBoxTableShells(text) {
  const dropped = [];
  const next = text.replace(/\s*<Entity>\s*<Name [^>]*>([^<]+)<\/Name>([\s\S]*?)<\/Entity>/g, (match, name, body) => {
    if (!OUT_OF_BOX_TABLES.has(name.toLowerCase())) return match;
    if (!/<attributes\s*\/>/.test(body) || /<(FormXml|SavedQueries|Visualizations)>/.test(body)) {
      throw new UnsafeTransformError(`the ${name} shell carries columns, forms or views; the survey would depend on them`);
    }
    dropped.push({ table: name.toLowerCase(), ribbonCustomActions: [...body.matchAll(/<CustomAction Id="([^"]+)"/g)].map((m) => m[1]) });
    return '';
  });
  return { text: next, removed: dropped.length, dropped };
}

/** Stops the build on any relationship to another product's table; the target org would lack it. */
export function assertOnlySurveyAndOutOfBoxRelationships(text) {
  for (const [, name, body] of text.matchAll(/<EntityRelationship Name="([^"]+)">([\s\S]*?)<\/EntityRelationship>/g)) {
    const foreign = [tag(body, 'ReferencingEntityName'), tag(body, 'ReferencedEntityName')].find((table) => isPrefixedTable(table) && !isSurveyTable(table));
    if (foreign) throw new UnsafeTransformError(`relationship ${name} needs ${foreign}, which is not part of the survey`);
  }
  return { text, removed: 0 };
}

/** Ordered list: [name, why, transform], applied to customizations.xml. */
export const CUSTOMIZATION_TRANSFORMS = [
  ...SHARED_TRANSFORMS.filter(([name]) => !DEBT_COLLECTION_ONLY.has(name)),
  ['cloud-trigger-steps', 'F4: the six SurveyTriggerPlugin steps name the cloud org\'s request tables; qdb_srv_ActivateSource creates them on-prem', removeCloudTriggerSteps],
  ['own-app-icon', 'F10: the app used the platform default icon web resource, which a 9.1 org may not have', useOwnAppIcon],
  ['out-of-box-table-shells', 'account, contact and queue shells carried the cloud org\'s own customizations of those tables (the Report Engine ribbon on account); the survey needs none of them', removeOutOfBoxTableShells],
  ['relationship-guard', 'Every relationship must be between survey tables or to an out-of-box table', assertOnlySurveyAndOutOfBoxRelationships],
];

/**
 * solution.xml: drops the root components and missing dependencies of the removed steps, the
 * platform icon dependency, and the out-of-box table self-dependencies, then applies the shared
 * 9.0 stamping (which also removes the AppSetting dependencies). Anything else left is reported.
 */
export function transformSurveySolutionManifest(text, { removedStepIds }) {
  const removed = new Set(removedStepIds);
  let removedRootComponents = 0;
  let removedDependencies = 0;
  const withoutSteps = text.replace(/\s*<RootComponent type="92" id="\{([^}]+)\}"[^>]*\/>/g, (match, id) => {
    if (!removed.has(id.toLowerCase())) return match;
    removedRootComponents += 1;
    return '';
  }).replace(/\s*<RootComponent type="1" schemaName="([^"]+)" behavior="1" \/>/g, (match, table) => {
    if (!OUT_OF_BOX_TABLES.has(table)) return match;
    removedRootComponents += 1;
    return '';
  });
  const withoutDependencies = withoutSteps.replace(/\s*<MissingDependency>([\s\S]*?)<\/MissingDependency>/g, (match, body) => {
    if (!isRemovableDependency(body, removed)) return match;
    removedDependencies += 1;
    return '';
  });
  return { ...transformSolutionManifest(withoutDependencies), removedRootComponents, removedSurveyDependencies: removedDependencies };
}

function isRemovableDependency(body, removedIds) {
  const required = /<Required ([^>]*)/.exec(body)?.[1] ?? '';
  const dependent = /<Dependent ([^>]*)/.exec(body)?.[1] ?? '';
  const attribute = (attributes, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? '';
  const dependentId = attribute(dependent, 'id').replace(/[{}]/g, '').toLowerCase();
  if (dependentId && removedIds.has(dependentId)) return true;
  if (attribute(dependent, 'type') === '80' && attribute(required, 'schemaName') === 'msdyn_/Images/AppModule_Default_Icon.png') return true;
  const table = attribute(required, 'schemaName');
  return attribute(required, 'type') === '1' && attribute(dependent, 'type') === '1' && OUT_OF_BOX_TABLES.has(table) && attribute(dependent, 'schemaName') === table;
}
