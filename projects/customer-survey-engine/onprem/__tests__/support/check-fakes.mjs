import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export const SurveyChecks = createRequire(import.meta.url)('../../checks/survey-checks.js');

export const HEALTH_VIEW = { table: 'asyncoperation', name: 'Survey Jobs - Failed or Suspended' };

/** A kit with nothing in its lists, so each test names only the components its check reads. */
export const emptyKit = (overrides = {}) => ({
  largestWebResourceBytes: 100, formEngineTables: [], formEngineIcons: [], formEngineColumns: [], surveyTables: [],
  roleNames: [], customApis: [], surveyIcons: [], surveyViews: [], formEnginePluginAssembly: 'Qdb.FormEngine.Plugins',
  surveyPluginAssembly: 'Qdb.SurveyEngine', appModule: 'qdb_survey_engine', solution: 'SurveyEngine',
  publisher: { uniqueName: 'qdb', prefix: 'qdb', optionValuePrefix: 10000 }, designerResource: 'qdb_designer',
  runtimeResource: 'qdb_runtime', dispatchPluginType: 'Dispatch', triggerPluginType: 'Trigger', schedulerRoleName: 'Survey Scheduler', hashes: {}, ...overrides,
});

export const emptyConfig = (overrides = {}) => ({ settings: {}, sources: [], smsConfigs: [], ...overrides });

export const notFound = () => Object.assign(new Error('404 Resource not found'), { status: 404 });

export const rows = (...values) => ({ value: values });

/**
 * A Web API GET that answers from `answers`: the first key (in insertion order) the path starts with wins;
 * an Error answer is thrown. RetrieveVersion answers 9.1 unless a key overrides it; anything else is an
 * empty result, so a probe for a row finds none and a metadata read succeeds.
 */
export const fakeGet = (answers = {}) => {
  const all = { 'RetrieveVersion()': { Version: '9.1.42.8' }, ...answers };
  return async (path) => {
    const prefix = Object.keys(all).find((key) => path.startsWith(key));
    if (prefix === undefined) return { value: [] };
    if (all[prefix] instanceof Error) throw all[prefix];
    return all[prefix];
  };
};

export const checkOf = (report, id) => report.checks.find((check) => check.id === id);

export const checksOf = (report, id) => report.checks.filter((check) => check.id === id);

export const base64Of = (text) => Buffer.from(text).toString('base64');

export const sha256Of = (text) => createHash('sha256').update(text).digest('hex');
