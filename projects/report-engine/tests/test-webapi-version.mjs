import { fileURLToPath } from 'node:url';
const CORE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
const RIBBON = fileURLToPath(new URL('../prototype/report-ribbon.js', import.meta.url));
// Which Web API version the web resources ask for.
//
// All three named v9.2. Dataverse online serves it; the last on-premises release is 9.1 and answers
// a v9.2 path with 404 — and a 404 here does not look like a wrong URL, it looks like a permissions
// problem: empty table pickers, a publish that fails, a ribbon flyout with nothing in it.
//
// The helper is duplicated across three separately loaded web resources because there is no shared
// scope to hoist it into. That is exactly the arrangement that drifts, so the drift is asserted
// against here rather than trusted to a comment.
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

const core = readFileSync(CORE, 'utf8');
const designer = readFileSync(DESIGNER, 'utf8');
const ribbon = readFileSync(RIBBON, 'utf8');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

/** Builds the engine's webApiVersion() against an org reporting `reported`. */
function versionFor(reported) {
  const xrm = () => ({
    Utility: { getGlobalContext: () => ({
      getVersion: () => { if (reported instanceof Error) throw reported; return reported; },
      getClientUrl: () => 'https://org.crm4.dynamics.com'
    }) }
  });
  const api = new Function('xrm', `
    ${liftDeclaration(core, 'FALLBACK_WEB_API_VERSION')}
    ${liftDeclaration(core, 'webApiVersionCache')}
    ${liftDeclaration(core, 'webApiVersion')}
    ${liftDeclaration(core, 'webApiUrl')}
    return { webApiVersion, webApiUrl };`)(xrm);
  return api;
}

console.log('reading the version off the org');
check('an on-premises 9.1 org asks for v9.1',
  versionFor('9.1.0.4967').webApiVersion() === '9.1');
check('a Dataverse online org asks for v9.2',
  versionFor('9.2.24084.00187').webApiVersion() === '9.2');
check('a two-part version still parses', versionFor('9.1').webApiVersion() === '9.1');

console.log('\nwhen the org will not say');
// 9.1 is served by every 9.x org, cloud and on-premises, so it is the safe thing not to know.
check('an empty version falls back to 9.1', versionFor('').webApiVersion() === '9.1');
check('a null version falls back to 9.1', versionFor(null).webApiVersion() === '9.1');
check('an unparseable version falls back to 9.1',
  versionFor('not-a-version').webApiVersion() === '9.1');
// Outside a CRM session getGlobalContext() throws; a metadata read must fail on its own guard with
// a message about the session, not here on a TypeError.
check('a throwing global context falls back rather than propagating',
  versionFor(new Error('no global context')).webApiVersion() === '9.1');

console.log('\nthe url it builds');
check('names the version the org reported',
  versionFor('9.1.0.4967').webApiUrl('EntityDefinitions')
    === 'https://org.crm4.dynamics.com/api/data/v9.1/EntityDefinitions');
check('and on cloud names v9.2',
  versionFor('9.2.24084.00187').webApiUrl('EntityDefinitions')
    === 'https://org.crm4.dynamics.com/api/data/v9.2/EntityDefinitions');

console.log('\nasked once, not per request');
const once = versionFor('9.1.0.4967');
once.webApiUrl('a'); once.webApiUrl('b');
check('the answer is cached', once.webApiVersion() === '9.1');

console.log('\nno web resource names a version of its own');
const files = [['report-engine-core.js', core], ['report-designer.html', designer],
               ['report-ribbon.js', ribbon]];
for (const [name, text] of files) {
  const hardcoded = text.match(/api\/data\/v9\.\d/g) || [];
  check(`${name} hardcodes none`, hardcoded.length === 0, hardcoded.join(', '));
  check(`${name} carries the helper`, /function webApiVersion\s*\(/.test(text));
  check(`${name} falls back to 9.1`, /FALLBACK_WEB_API_VERSION\s*=\s*"9\.1"/.test(text));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
