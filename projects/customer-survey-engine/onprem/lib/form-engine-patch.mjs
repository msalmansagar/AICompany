/**
 * Rules for the Form Engine column patch (QdbFormEngineSurveyUpdate) in the on-prem kit. The patch
 * carries only the survey columns on three Form Engine tables, so its missing dependencies are the
 * Form Engine itself: those tables and their icons, all in the original on-prem Form Engine package
 * (FORM_ENGINE_unmanaged.zip). They are KEPT, so CRM refuses the import on an org without the Form
 * Engine; any other dependency stops the build.
 *
 * @module survey-onprem/form-engine-patch
 */
import { transformSolutionManifest } from '../../../debtcollection/crm/scripts/lib/onprem-transforms.mjs';

export const PATCH_COLUMNS = Object.freeze([
  'qdb_form_definition.qdb_form_type', 'qdb_form_definition.qdb_scoring_mode',
  'qdb_form_field.qdb_score_weight', 'qdb_form_field.qdb_score_min', 'qdb_form_field.qdb_score_max',
  'qdb_form_option_value.qdb_score_points',
]);
const FORM_ENGINE_TABLES = new Set(['qdb_form_definition', 'qdb_form_field', 'qdb_form_option_value']);

/** True when the dependency is the Form Engine table or table icon the patch extends. */
export function isFormEnginePrerequisite(body) {
  const required = /<Required ([^>]*)/.exec(body)?.[1] ?? '';
  const type = /\btype="([^"]*)"/.exec(required)?.[1];
  const name = /\bschemaName="([^"]*)"/.exec(required)?.[1] ?? '';
  if (type === '1') return FORM_ENGINE_TABLES.has(name);
  return type === '61' && FORM_ENGINE_TABLES.has(name.replace(/^qdb_icon_/, 'qdb_'));
}

/** Stamps solution.xml for 9.x on-prem; refuses any dependency that is not a Form Engine prerequisite. */
export function transformPatchManifest(text) {
  const unexpected = [...text.matchAll(/<MissingDependency>([\s\S]*?)<\/MissingDependency>/g)].filter(([, body]) => !isFormEnginePrerequisite(body));
  if (unexpected.length > 0) throw new Error(`the Form Engine patch has ${unexpected.length} dependency(ies) outside the Form Engine`);
  const result = transformSolutionManifest(text);
  return { ...result, keptPrerequisites: result.remainingDependencies };
}

/** The patch columns actually present in customizations.xml, as table.column. */
export function columnsIn(customizations) {
  const columns = [];
  for (const [, table, body] of customizations.matchAll(/<Entity>\s*<Name [^>]*>([^<]+)<\/Name>([\s\S]*?)<\/Entity>/g)) {
    for (const [, column] of body.matchAll(/<attribute PhysicalName="([^"]+)">/g)) columns.push(`${table}.${column.toLowerCase()}`);
  }
  return columns.sort();
}
