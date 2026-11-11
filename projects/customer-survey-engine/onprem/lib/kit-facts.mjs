/**
 * The facts the on-prem checks compare an org against, assembled from the sources of truth: the
 * schema and UI manifests, and the built kit's package manifests. Nothing here is typed twice.
 *
 * @module survey-onprem/kit-facts
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROLES, SOLUTION, TABLES } from '../../provisioning/manifest.mjs';
import { APP } from '../../provisioning/ui-manifest.mjs';
import { ICONS, iconResourceName } from '../../provisioning/ui-icons.mjs';
import { PATCH_COLUMNS } from './form-engine-patch.mjs';
import { extract } from './package-tools.mjs';

const FORM_ENGINE_TABLES = ['qdb_form_definition', 'qdb_form_field', 'qdb_form_option_value', 'qdb_form_render_cache'];
const PLUGIN_TYPES = 'Qdb.SurveyEngine.Plugins';

/** Size of the largest file in a solution zip: the org's upload limit must allow it. */
function largestFileIn(zip) {
  const workDir = mkdtempSync(join(tmpdir(), 'kit-facts-'));
  try {
    extract(zip, workDir);
    return Math.max(...readdirSync(workDir, { recursive: true }).map((name) => statSync(join(workDir, name))).filter((stat) => stat.isFile()).map((stat) => stat.size));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** @param {string} kitDir onprem-deploy/<date> */
export function readKitFacts(kitDir) {
  const survey = JSON.parse(readFileSync(resolve(kitDir, 'package-manifest.json'), 'utf8'));
  const formEngine = JSON.parse(readFileSync(resolve(kitDir, 'form-engine/package-manifest.json'), 'utf8'));
  return {
    solution: SOLUTION.uniqueName,
    publisher: { uniqueName: SOLUTION.publisherUniqueName, prefix: 'qdb', optionValuePrefix: 10000 },
    surveyTables: TABLES.map((table) => table.name),
    roleNames: ROLES.map((role) => role.name),
    customApis: survey.contents.customApis,
    surveyIcons: Object.keys(ICONS).map(iconResourceName),
    appModule: APP.uniqueName,
    surveyPluginAssembly: 'Qdb.SurveyEngine',
    dispatchPluginType: `${PLUGIN_TYPES}.InvitationDispatchPlugin`,
    triggerPluginType: `${PLUGIN_TYPES}.SurveyTriggerPlugin`,
    formEngineTables: FORM_ENGINE_TABLES,
    formEngineIcons: FORM_ENGINE_TABLES.slice(0, 3).map((table) => table.replace(/^qdb_/, 'qdb_icon_')),
    formEngineColumns: [...PATCH_COLUMNS],
    formEnginePluginAssembly: 'Qdb.FormEngine.Plugins',
    designerResource: 'qdb_/form-designer/index.html',
    runtimeResource: 'qdb_form_runtime.html',
    largestWebResourceBytes: largestFileIn(resolve(kitDir, 'form-engine', formEngine.webResources.file)),
    hashes: { designer: formEngine.webResources.designerSha256, runtime: formEngine.webResources.runtimeSha256, formEnginePlugin: formEngine.plugin.sha256 },
  };
}
