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

async function timeCall(label, method, path, body) {
  const accessToken = await currentToken();
  const startedAt = process.hrtime.bigint();
  const response = await request(method, path, accessToken, body);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const parsed = parseBody(response);
  return { label, elapsedMs, status: response.status, engineMs: engineMsOf(parsed), ok: response.status < 300 };
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

const whoAmI = () => timeCall('WhoAmI', 'GET', `${API}/WhoAmI`, null);

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

async function deleteFixture(fixture) {
  const accessToken = await currentToken();
  if (fixture.versionId) await request('DELETE', `${API}/qdb_edp_ruleversions(${fixture.versionId})`, accessToken, null);
  if (fixture.ruleId) await request('DELETE', `${API}/qdb_edp_rules(${fixture.ruleId})`, accessToken, null);
}

// --- phases ----------------------------------------------------------------

async function measureWarmBaseline(versionId) {
  log('P0 — warm baseline');
  for (let i = 0; i < WARM_UP_CALL_COUNT; i++) await testRule(versionId);

  const testRuleSamples = [];
  const evaluateSamples = [];
  for (let i = 0; i < WARM_SAMPLE_COUNT; i++) {
    testRuleSamples.push(await recorded('warm', await testRule(versionId)));
    evaluateSamples.push(await recorded('warm', await evaluateDecision(versionId)));
  }
  const floorSamples = [];
  for (let i = 0; i < WARM_SAMPLE_COUNT; i++) floorSamples.push(await recorded('warm', await whoAmI()));

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
  const floor = recorded(phase, await whoAmI());
  const firstPluginCall = recorded(phase, await testRule(versionId));
  const otherPluginType = recorded(phase, await evaluateDecision(versionId));
  const repeatCall = recorded(phase, await testRule(versionId));
  return { floor, firstPluginCall, otherPluginType, repeatCall };
}

async function findIdleThreshold(versionId, warmTestRuleP50) {
  log('P1 — idle staircase');
  const coldLimitMs = warmTestRuleP50 * COLD_FACTOR_THRESHOLD;
  log(`  a call counts as cold above ${Math.round(coldLimitMs)}ms (${COLD_FACTOR_THRESHOLD}x warm p50)`);

  const steps = [];
  let consecutiveCold = 0;
  for (const minutes of staircaseMinutes) {
    await testRule(versionId);
    await testRule(versionId);
    await idleFor(minutes);

    const probe = await probeAfterIdle(versionId, `idle-${minutes}min`);
    const isCold = probe.firstPluginCall.elapsedMs > coldLimitMs;
    steps.push({ idleMinutes: minutes, isCold, ...flattenProbe(probe) });
    log(`  ${minutes} min idle → ${Math.round(probe.firstPluginCall.elapsedMs)}ms ${isCold ? 'COLD' : 'warm'}`
      + ` (floor ${Math.round(probe.floor.elapsedMs)}ms, other plugin ${Math.round(probe.otherPluginType.elapsedMs)}ms,`
      + ` repeat ${Math.round(probe.repeatCall.elapsedMs)}ms)`);

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
    floorMs: Math.round(probe.floor.elapsedMs),
    firstPluginCallMs: Math.round(probe.firstPluginCall.elapsedMs),
    otherPluginTypeMs: Math.round(probe.otherPluginType.elapsedMs),
    repeatCallMs: Math.round(probe.repeatCall.elapsedMs),
    engineMsOnColdCall: probe.firstPluginCall.engineMs,
  };
}

// If a ping at half the observed threshold holds the sandbox warm, a keep-warm job is a real
// option and the posture question becomes a cost question rather than an engineering one.
async function testKeepWarm(versionId, thresholdMinutes, coldLimitMs) {
  const pingEveryMinutes = Math.max(1, Math.floor(thresholdMinutes / 2));
  const pingCount = 3;
  log(`P2 — keep-warm: ping every ${pingEveryMinutes} min across ${pingEveryMinutes * pingCount} min (past the ${thresholdMinutes} min threshold)`);

  await testRule(versionId);
  for (let i = 0; i < pingCount; i++) {
    await idleFor(pingEveryMinutes);
    const ping = recorded('keep-warm-ping', await testRule(versionId));
    log(`    ping ${i + 1}/${pingCount} → ${Math.round(ping.elapsedMs)}ms`);
  }
  await idleFor(pingEveryMinutes);
  const probe = await probeAfterIdle(versionId, 'keep-warm-final');
  const heldWarm = probe.firstPluginCall.elapsedMs <= coldLimitMs;
  log(`  after ${pingEveryMinutes * (pingCount + 1)} min of pinging → ${Math.round(probe.firstPluginCall.elapsedMs)}ms ${heldWarm ? 'STILL WARM' : 'WENT COLD ANYWAY'}`);
  return { pingEveryMinutes, totalMinutesCovered: pingEveryMinutes * (pingCount + 1), heldWarm, ...flattenProbe(probe) };
}

// --- entry point -----------------------------------------------------------

async function main() {
  log(`org ${HOST} · samples → ${outPath}`);
  const fixture = await createFixture();
  log(`fixture rule version ${fixture.versionId.slice(0, 8)}`);

  try {
    const baseline = await measureWarmBaseline(fixture.versionId);
    const staircase = await findIdleThreshold(fixture.versionId, baseline.testRule.p50);

    const firstColdStep = staircase.steps.find(step => step.isCold);
    const keepWarm = firstColdStep
      ? await testKeepWarm(fixture.versionId, firstColdStep.idleMinutes, staircase.coldLimitMs)
      : null;

    const summary = {
      org: HOST,
      completedAt: new Date().toISOString(),
      baseline,
      staircase,
      thresholdMinutes: firstColdStep ? firstColdStep.idleMinutes : null,
      keepWarm,
    };
    fs.writeFileSync(outPath.replace(/\.jsonl$/, '') + '-summary.json', JSON.stringify(summary, null, 2));
    log('DONE');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await deleteFixture(fixture);
    log('fixture deleted');
  }
}

main().catch(error => { console.error(error); process.exit(1); });
