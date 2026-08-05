'use strict';
// Spike harness for OQ-B6 — what is the cold-start posture of the EDP sandbox plugin?
//
// OQ-B1 observed ONE cold call at 6,147 ms and could not say how often a user would meet it.
// Severity without frequency cannot decide a posture, so this measures four things:
//   P0  warm baseline, per API, to have something to call "cold" relative to
//   P1  the idle threshold — how long the sandbox must sit unused before it goes cold
//   P1b warm locality — does warming one plugin type warm the others in the same assembly
//   P2  whether a keep-warm ping actually holds the sandbox warm
//
// Every probe subtracts a WhoAmI issued immediately before it. WhoAmI runs no plugin, so it
// prices the network, the TLS reconnect a long idle forces, and the platform floor — leaving
// the remainder attributable to the sandbox rather than to the connection.
//
// Runs unattended for up to ~2 hours. Appends every sample to JSONL as it goes, so a run that
// dies part-way still yields usable data. Creates and deletes its own rule.
//
// Usage: node measure-cold-start.js [--out <path>] [--quick] [--idle 5,10,15]
const fs = require('fs');
const https = require('https');

const ENV_PATH = process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env';
const API = '/api/data/v9.2';
const PUBLISHED_LIFECYCLE_STATE = 100000003;

const WARM_SAMPLE_COUNT = 10;
const WARM_UP_CALL_COUNT = 3;
const COLD_FACTOR_THRESHOLD = 3;
const CONSECUTIVE_COLD_RESULTS_TO_STOP = 2;
const IDLE_STAIRCASE_MINUTES = [5, 10, 15, 20, 30, 45];
const QUICK_STAIRCASE_MINUTES = [2, 4];
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const env = readEnvFile(ENV_PATH);
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const HOST = new URL(ORG).host;
const agent = new https.Agent({ keepAlive: true });

const outPath = argValue('--out') || 'cold-start-samples.jsonl';
const staircaseMinutes = resolveStaircase();

function resolveStaircase() {
  const override = argValue('--idle');
  if (override) return override.split(',').map(Number).filter(minutes => minutes > 0);
  return process.argv.includes('--quick') ? QUICK_STAIRCASE_MINUTES : IDLE_STAIRCASE_MINUTES;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}

function readEnvFile(path) {
  const values = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function log(message) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

function recordSample(sample) {
  fs.appendFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), ...sample }) + '\n');
}

// The run is mostly waiting, so an interruption at the last step is expensive to repeat. Progress
// is checkpointed after every step and --resume picks up from the last completed one.
const statePath = outPath.replace(/\.jsonl$/, '') + '-state.json';

function loadState() {
  if (!process.argv.includes('--resume') || !fs.existsSync(statePath)) return { steps: [] };
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  log(`resuming — ${state.steps.length} step(s) already measured${state.baseline ? ', baseline reused' : ''}`);
  return state;
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// --- transport -------------------------------------------------------------

function request(method, path, accessToken, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = {
      Accept: 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Authorization: `Bearer ${accessToken}`,
      ...extraHeaders,
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ host: HOST, path, method, headers, agent }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function acquireToken() {
  const form = `client_id=${env.AZURE_CLIENT_ID}`
    + `&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}`
    + `&grant_type=client_credentials`
    + `&scope=${encodeURIComponent(ORG + '/.default')}`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'login.microsoftonline.com',
      path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) },
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(form);
    req.end();
  });
}

// Token acquisition is deliberately never inside a measured window.
const tokenCache = { value: null, expiresAt: 0 };

async function currentToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS) return tokenCache.value;
  const granted = await acquireToken();
  tokenCache.value = granted.access_token;
  tokenCache.expiresAt = Date.now() + Number(granted.expires_in || 3600) * 1000;
  return tokenCache.value;
}

// --- measurement -----------------------------------------------------------

const parseBody = response => { try { return JSON.parse(response.body); } catch { return {}; } };

// What goes cold is the sandbox, so idle is measured from the last call that actually invoked a
// plugin — not from the last call of any kind, and not from the nominal sleep. A retry, or a
// workstation that slept, then shows up as a longer measured idle instead of corrupting the step.
let lastSandboxCallAt = Date.now();

async function timeCall(label, method, path, body, { touchesSandbox = true } = {}) {
  const accessToken = await currentToken();
  const startedAt = process.hrtime.bigint();
  const response = await request(method, path, accessToken, body);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  if (touchesSandbox) lastSandboxCallAt = Date.now();
  const parsed = parseBody(response);
  return { label, elapsedMs, status: response.status, engineMs: engineMsOf(parsed), ok: response.status < 300 };
}

// A DNS or connect failure never reached Dataverse, so the sandbox is untouched and still cold.
// Anything else may have arrived and woken it.
const NEVER_REACHED_SERVER_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH']);
const RETRY_BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 60_000, 60_000];

// A five-minute DNS blip killed a two-hour run once. Retries make the run survivable, but a retry
// is never folded into a measured window — it produces a fresh timed sample, and `attempts`
// records that it happened. For a cold-sensitive probe the retry is only valid if the failed
// attempt never reached the server; otherwise the step is marked invalid rather than reported as
// a cold measurement that silently isn't one.
async function measure(callFactory, { coldSensitive = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const outcome = await attemptCall(callFactory);
    if (outcome.sample?.ok) return { ...outcome.sample, attempts: attempt + 1 };

    const neverReached = outcome.error ? NEVER_REACHED_SERVER_CODES.has(outcome.error.code) : false;
    if (coldSensitive && !neverReached) {
      return { label: 'invalidated', elapsedMs: null, ok: false, invalidated: true, attempts: attempt + 1,
        reason: outcome.error ? outcome.error.code : `status ${outcome.sample.status}` };
    }
    if (attempt >= RETRY_BACKOFF_MS.length) throw outcome.error || new Error(`giving up after status ${outcome.sample.status}`);

    const reason = outcome.error ? (outcome.error.code || outcome.error.message) : `status ${outcome.sample.status}`;
    log(`    call failed (${reason}) — retrying in ${RETRY_BACKOFF_MS[attempt] / 1000}s`);
    await sleep(RETRY_BACKOFF_MS[attempt]);
  }
}

async function attemptCall(callFactory) {
  try {
    return { sample: await callFactory() };
  } catch (error) {
    return { error };
  }
}

// The runtime reports its own execution time inside the result payload; a cold call that still
// reports ~0 ms of engine time proves the delay is platform-side, not ours.
function engineMsOf(parsed) {
  for (const key of ['ResultJson', 'OutputsJson', 'TraceJson']) {
    try {
      const inner = JSON.parse(parsed[key]);
      const found = inner?.executionTimeMs ?? inner?.durationMs ?? inner?.elapsedMs;
      if (typeof found === 'number') return found;
    } catch { /* key absent or not JSON — try the next one */ }
  }
  return null;
}

const whoAmI = () => timeCall('WhoAmI', 'GET', `${API}/WhoAmI`, null, { touchesSandbox: false });

const testRule = versionId => timeCall('TestRule', 'POST', `${API}/qdb_edp_TestRule`, {
  RuleVersionId: versionId,
  InputsJson: JSON.stringify({ amount: 5000 }),
});

const evaluateDecision = versionId => timeCall('EvaluateDecision', 'POST', `${API}/qdb_edp_EvaluateDecision`, {
  RuleVersionId: versionId,
  InputsJson: JSON.stringify({ amount: 5000 }),
});

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]);
}

function summarise(label, samples) {
  const values = samples.filter(s => s.ok).map(s => s.elapsedMs);
  return { label, n: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: percentile(values, 1) };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function idleFor(minutes) {
  log(`  idling ${minutes} min — no calls issued`);
  const wakeAt = Date.now() + minutes * 60_000;
  while (Date.now() < wakeAt) {
    await sleep(Math.min(60_000, wakeAt - Date.now()));
    const remaining = Math.round((wakeAt - Date.now()) / 60_000);
    if (remaining > 0) log(`    ${remaining} min remaining`);
  }
}

const minutesSinceSandboxCall = () => Math.round((Date.now() - lastSandboxCallAt) / 6_000) / 10;

// --- fixture ---------------------------------------------------------------

const PCRM_DOCUMENT = {
  schemaVersion: '1.0',
  name: 'ColdStart',
  targetEntity: 'account',
  inputs: [{ name: 'amount', type: 'Decimal' }],
  outputs: [{ name: 'tier', type: 'Text' }],
  logic: {
    type: 'decisionTable',
    hitPolicy: 'First',
    tableInputs: [{ field: 'amount' }],
    outputColumns: ['tier'],
    rows: [{ cells: [{ operator: 'GreaterThan', value: 1000 }], outputs: { tier: 'high' } }],
    defaultRow: { outputs: { tier: 'low' } },
  },
};

// Dataverse answers a create with 204 and no body unless representation is asked for, and the
// harness needs the generated ids back.
const RETURN_CREATED_RECORD = { Prefer: 'return=representation' };

async function createFixture() {
  const accessToken = await currentToken();
  const ruleResponse = await request('POST', `${API}/qdb_edp_rules`, accessToken,
    { qdb_edp_rulename: 'ZZ ColdStart Spike' }, RETURN_CREATED_RECORD);
  const ruleId = parseBody(ruleResponse).qdb_edp_ruleid;
  if (!ruleId) throw new Error(`Rule create failed (${ruleResponse.status}): ${ruleResponse.body.slice(0, 400)}`);

  const versionResponse = await request('POST', `${API}/qdb_edp_ruleversions`, accessToken, {
    qdb_edp_ruleversionname: 'ZZ ColdStart v1',
    qdb_edp_versionnumber: 1,
    qdb_edp_lifecyclestate: PUBLISHED_LIFECYCLE_STATE,
    qdb_edp_pcrmjson: JSON.stringify(PCRM_DOCUMENT),
    'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})`,
  }, RETURN_CREATED_RECORD);
  const versionId = parseBody(versionResponse).qdb_edp_ruleversionid;
  if (!versionId) throw new Error(`Version create failed (${versionResponse.status}): ${versionResponse.body.slice(0, 400)}`);
  return { ruleId, versionId };
}

// An earlier version ignored the delete status and reported success while leaving a rule behind
// in the org. A cleanup that cannot fail visibly is not a cleanup.
async function deleteFixture(fixture) {
  const failures = [];
  if (fixture.versionId) failures.push(...await deleteRecord(`qdb_edp_ruleversions(${fixture.versionId})`));
  if (fixture.ruleId) failures.push(...await deleteRecord(`qdb_edp_rules(${fixture.ruleId})`));
  if (failures.length) {
    log(`  CLEANUP INCOMPLETE — ${failures.join('; ')}`);
    log(`  re-run with --cleanup once connectivity is back`);
    return false;
  }
  return true;
}

async function deleteRecord(resourcePath) {
  for (let attempt = 0; ; attempt++) {
    try {
      const accessToken = await currentToken();
      const response = await request('DELETE', `${API}/${resourcePath}`, accessToken, null);
      if (response.status < 300 || response.status === 404) return [];
      if (attempt >= 3) return [`${resourcePath} -> ${response.status} ${response.body.slice(0, 200)}`];
    } catch (error) {
      if (attempt >= 3) return [`${resourcePath} -> ${error.code || error.message}`];
    }
    await sleep(RETRY_BACKOFF_MS[attempt]);
  }
}

// Sweeps anything a killed run left behind, matched by the fixture's reserved name prefix.
async function cleanupOrphans() {
  const accessToken = await currentToken();
  const collections = [
    { set: 'qdb_edp_ruleversions', id: 'qdb_edp_ruleversionid', name: 'qdb_edp_ruleversionname' },
    { set: 'qdb_edp_rules', id: 'qdb_edp_ruleid', name: 'qdb_edp_rulename' },
  ];
  for (const collection of collections) {
    const query = `${API}/${collection.set}?$select=${collection.id}&$filter=startswith(${collection.name},'ZZ ColdStart')`;
    const found = parseBody(await request('GET', encodeURI(query), accessToken, null)).value || [];
    for (const record of found) {
      const failures = await deleteRecord(`${collection.set}(${record[collection.id]})`);
      log(`  ${collection.set} ${record[collection.id].slice(0, 8)} → ${failures.length ? failures[0] : 'deleted'}`);
    }
    if (!found.length) log(`  ${collection.set} — nothing left behind`);
  }
}

// --- phases ----------------------------------------------------------------

async function measureWarmBaseline(versionId) {
  log('P0 — warm baseline');
  for (let i = 0; i < WARM_UP_CALL_COUNT; i++) await measure(() => testRule(versionId));

  const testRuleSamples = [];
  const evaluateSamples = [];
  for (let i = 0; i < WARM_SAMPLE_COUNT; i++) {
    testRuleSamples.push(recorded('warm', await measure(() => testRule(versionId))));
    evaluateSamples.push(recorded('warm', await measure(() => evaluateDecision(versionId))));
  }
  const floorSamples = [];
  for (let i = 0; i < WARM_SAMPLE_COUNT; i++) floorSamples.push(recorded('warm', await measure(() => whoAmI())));

  const baseline = {
    whoAmI: summarise('WhoAmI', floorSamples),
    testRule: summarise('TestRule', testRuleSamples),
    evaluateDecision: summarise('EvaluateDecision', evaluateSamples),
  };
  log(`  warm p50 — WhoAmI ${baseline.whoAmI.p50}ms · TestRule ${baseline.testRule.p50}ms · EvaluateDecision ${baseline.evaluateDecision.p50}ms`);
  return baseline;
}

function recorded(phase, sample) {
  recordSample({ phase, ...sample });
  return sample;
}

// One probe = floor, then the cold hit, then a different plugin type in the same assembly,
// then a repeat of the first. The 3rd and 4th calls are what separate "the assembly woke up"
// from "only this plugin type woke up".
async function probeAfterIdle(versionId, phase) {
  // WhoAmI runs no plugin, so it prices the TLS reconnect the idle forced without waking the
  // sandbox — and it can be retried freely for the same reason.
  const floor = recorded(phase, await measure(() => whoAmI()));
  const measuredIdleMinutes = minutesSinceSandboxCall();
  const firstPluginCall = recorded(phase, await measure(() => testRule(versionId), { coldSensitive: true }));
  const otherPluginType = recorded(phase, await measure(() => evaluateDecision(versionId)));
  const repeatCall = recorded(phase, await measure(() => testRule(versionId)));
  return { floor, firstPluginCall, otherPluginType, repeatCall, measuredIdleMinutes };
}

async function findIdleThreshold(versionId, warmTestRuleP50, state) {
  log('P1 — idle staircase');
  const coldLimitMs = warmTestRuleP50 * COLD_FACTOR_THRESHOLD;
  log(`  a call counts as cold above ${Math.round(coldLimitMs)}ms (${COLD_FACTOR_THRESHOLD}x warm p50)`);

  const steps = state.steps;
  const alreadyMeasured = new Set(steps.filter(step => !step.invalid).map(step => step.idleMinutes));
  let consecutiveCold = 0;
  for (const minutes of staircaseMinutes) {
    if (alreadyMeasured.has(minutes)) {
      const previous = steps.find(step => step.idleMinutes === minutes);
      log(`  ${minutes} min idle → ${previous.firstPluginCallMs}ms ${previous.isCold ? 'COLD' : 'warm'} (from checkpoint)`);
      consecutiveCold = previous.isCold ? consecutiveCold + 1 : 0;
      if (consecutiveCold >= CONSECUTIVE_COLD_RESULTS_TO_STOP) break;
      continue;
    }
    await measure(() => testRule(versionId));
    await measure(() => testRule(versionId));
    await idleFor(minutes);

    const probe = await probeAfterIdle(versionId, `idle-${minutes}min`);
    if (probe.firstPluginCall.invalidated) {
      log(`  ${minutes} min idle → INVALID (${probe.firstPluginCall.reason}) — the failed attempt may have`
        + ` reached the sandbox, so this is not a trustworthy cold sample; step discarded`);
      steps.push({ idleMinutes: minutes, invalid: true, reason: probe.firstPluginCall.reason });
      saveState(state);
      consecutiveCold = 0;
      continue;
    }

    const isCold = probe.firstPluginCall.elapsedMs > coldLimitMs;
    steps.push({ idleMinutes: minutes, isCold, ...flattenProbe(probe) });
    saveState(state);
    log(`  ${minutes} min idle (measured ${probe.measuredIdleMinutes}) → ${Math.round(probe.firstPluginCall.elapsedMs)}ms`
      + ` ${isCold ? 'COLD' : 'warm'} (floor ${Math.round(probe.floor.elapsedMs)}ms,`
      + ` other plugin ${Math.round(probe.otherPluginType.elapsedMs)}ms, repeat ${Math.round(probe.repeatCall.elapsedMs)}ms)`);

    consecutiveCold = isCold ? consecutiveCold + 1 : 0;
    if (consecutiveCold >= CONSECUTIVE_COLD_RESULTS_TO_STOP) {
      log('  threshold confirmed by two consecutive cold results — stopping the staircase');
      break;
    }
  }
  return { coldLimitMs: Math.round(coldLimitMs), steps };
}

function flattenProbe(probe) {
  return {
    measuredIdleMinutes: probe.measuredIdleMinutes,
    floorMs: Math.round(probe.floor.elapsedMs),
    firstPluginCallMs: Math.round(probe.firstPluginCall.elapsedMs),
    otherPluginTypeMs: Math.round(probe.otherPluginType.elapsedMs),
    repeatCallMs: Math.round(probe.repeatCall.elapsedMs),
    engineMsOnColdCall: probe.firstPluginCall.engineMs,
    retriedAttempts: probe.firstPluginCall.attempts,
  };
}

// If a ping at half the observed threshold holds the sandbox warm, a keep-warm job is a real
// option and the posture question becomes a cost question rather than an engineering one.
async function testKeepWarm(versionId, thresholdMinutes, coldLimitMs) {
  const pingEveryMinutes = Math.max(1, Math.floor(thresholdMinutes / 2));
  const pingCount = 3;
  log(`P2 — keep-warm: ping every ${pingEveryMinutes} min across ${pingEveryMinutes * pingCount} min (past the ${thresholdMinutes} min threshold)`);

  await measure(() => testRule(versionId));
  for (let i = 0; i < pingCount; i++) {
    await idleFor(pingEveryMinutes);
    const ping = recorded('keep-warm-ping', await measure(() => testRule(versionId)));
    log(`    ping ${i + 1}/${pingCount} → ${Math.round(ping.elapsedMs)}ms`);
  }
  await idleFor(pingEveryMinutes);
  const probe = await probeAfterIdle(versionId, 'keep-warm-final');
  if (probe.firstPluginCall.invalidated) {
    log(`  keep-warm probe INVALID (${probe.firstPluginCall.reason})`);
    return { pingEveryMinutes, invalid: true, reason: probe.firstPluginCall.reason };
  }
  const heldWarm = probe.firstPluginCall.elapsedMs <= coldLimitMs;
  log(`  after ${pingEveryMinutes * (pingCount + 1)} min of pinging → ${Math.round(probe.firstPluginCall.elapsedMs)}ms ${heldWarm ? 'STILL WARM' : 'WENT COLD ANYWAY'}`);
  return { pingEveryMinutes, totalMinutesCovered: pingEveryMinutes * (pingCount + 1), heldWarm, ...flattenProbe(probe) };
}

// --- entry point -----------------------------------------------------------

async function main() {
  if (process.argv.includes('--cleanup')) {
    log('sweeping fixtures left behind by an interrupted run');
    return cleanupOrphans();
  }

  log(`org ${HOST} · samples → ${outPath}`);
  const fixture = await createFixture();
  log(`fixture rule version ${fixture.versionId.slice(0, 8)}`);

  // Whatever was collected before a failure is still worth having, so the summary is written from
  // a partial result rather than lost with the exception.
  const state = loadState();
  const summary = { org: HOST, staircaseRequested: staircaseMinutes, completed: false };
  try {
    summary.baseline = state.baseline || await measureWarmBaseline(fixture.versionId);
    state.baseline = summary.baseline;
    saveState(state);
    summary.staircase = await findIdleThreshold(fixture.versionId, summary.baseline.testRule.p50, state);

    const firstColdStep = summary.staircase.steps.find(step => step.isCold);
    summary.thresholdMinutes = firstColdStep ? firstColdStep.idleMinutes : null;
    summary.keepWarm = firstColdStep
      ? await testKeepWarm(fixture.versionId, firstColdStep.idleMinutes, summary.staircase.coldLimitMs)
      : null;
    summary.completed = true;
    log('DONE');
  } catch (error) {
    summary.failedWith = error.code || error.message;
    log(`RUN FAILED — ${summary.failedWith}; writing what was collected`);
    throw error;
  } finally {
    summary.finishedAt = new Date().toISOString();
    fs.writeFileSync(outPath.replace(/\.jsonl$/, '') + '-summary.json', JSON.stringify(summary, null, 2));
    if (await deleteFixture(fixture)) log('fixture deleted');
    if (summary.completed) console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch(error => { console.error(error); process.exit(1); });
