// scheduler/Invoke-RunDueSurveys.ps1 run under Windows PowerShell with a stubbed Invoke-RestMethod
// (001-scale-per-org FR-011, ADR-011; DEF-CSE-002). Each stub answer is consumed in order per Pass;
// the string "FAIL" makes that call throw, as a failed Custom API call does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../Invoke-RunDueSurveys.ps1', import.meta.url));
const KIT_COPY = fileURLToPath(new URL('../../onprem-deploy/2026-11-11/scheduler/Invoke-RunDueSurveys.ps1', import.meta.url));
const isWindows = process.platform === 'win32';

const STUB = `
param([string]$Script, [string]$AnswersPath, [string]$CallsPath, [string]$LogPath)
$answers = Get-Content -Raw $AnswersPath | ConvertFrom-Json
$global:stubIndex = @{}
function Invoke-RestMethod {
    param($Method, $Uri, $Body, $ContentType, $Headers, [switch]$UseDefaultCredentials, $TimeoutSec)
    $pass = ($Body | ConvertFrom-Json).Pass
    Add-Content -Path $CallsPath -Value $pass
    $index = [int]$global:stubIndex[$pass]
    $global:stubIndex[$pass] = $index + 1
    $list = @($answers.$pass)
    $answer = if ($index -lt $list.Count) { $list[$index] } else { $list[$list.Count - 1] }
    if ($answer -eq 'FAIL') { throw "Simulated $pass failure" }
    return $answer
}
& $Script -OrgUrl 'https://crm.example/QDB' -LogPath $LogPath -RunDate '2027-01-01' -MaxCalls 3
exit $LASTEXITCODE
`;

/** Runs the script with the answers; returns its exit code, the Pass of every call in order, and the log text. */
function runWith(answers) {
  const dir = mkdtempSync(join(tmpdir(), 'run-due-surveys-'));
  const stub = join(dir, 'stub.ps1');
  writeFileSync(stub, STUB);
  writeFileSync(join(dir, 'answers.json'), JSON.stringify(answers));
  const logs = join(dir, 'logs');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', stub,
    '-Script', SCRIPT, '-AnswersPath', join(dir, 'answers.json'), '-CallsPath', join(dir, 'calls.txt'), '-LogPath', logs], { encoding: 'utf8' });
  const callsFile = join(dir, 'calls.txt');
  const calls = existsSync(callsFile) ? readFileSync(callsFile, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  return { exitCode: result.status, calls, output: result.stdout + result.stderr };
}

const done = { IsComplete: true, Summary: 'done' };
const more = { IsComplete: false, Summary: 'running' };

test('bothPassesComplete_exitsZeroWithoutRecordingAFailure', { skip: !isWindows }, () => {
  const run = runWith({ OneTime: [done], Daily: [done] });

  assert.deepEqual([run.exitCode, run.calls], [0, ['OneTime', 'Daily']]);
});

test('dailyCallFails_recordsTheFailureInItsOwnCallAndExitsOne_FR011', { skip: !isWindows }, () => {
  const run = runWith({ OneTime: [done], Daily: ['FAIL'], RecordFailure: [done] });

  assert.deepEqual([run.exitCode, run.calls], [1, ['OneTime', 'Daily', 'RecordFailure']]);
});

test('dailyCallFails_stopsTheDailyLoop', { skip: !isWindows }, () => {
  const run = runWith({ OneTime: [done], Daily: [more, 'FAIL', done], RecordFailure: [done] });

  assert.deepEqual(run.calls, ['OneTime', 'Daily', 'Daily', 'RecordFailure']);
});

test('recordFailureItselfFails_isLoggedAndTheScriptStillExitsOne', { skip: !isWindows }, () => {
  const run = runWith({ OneTime: [done], Daily: ['FAIL'], RecordFailure: ['FAIL'] });

  assert.equal(run.exitCode, 1);
  assert.match(run.output, /RecordFailure: FAILED/);
});

test('oneTimeFails_doesNotRecordAScheduledFailure', { skip: !isWindows }, () => {
  const run = runWith({ OneTime: ['FAIL'], Daily: [done] });

  assert.deepEqual([run.exitCode, run.calls], [1, ['OneTime', 'Daily']]);
});

// At HL's size a run needs more calls than one scheduler run makes; that is progress, not a failure.
test('passStillRunningAfterMaxCalls_continuesNextRunWithoutFailing', { skip: !isWindows }, () => {
  const run = runWith({ OneTime: [done], Daily: [more] });

  assert.deepEqual([run.exitCode, run.calls.filter((pass) => pass === 'RecordFailure')], [0, []]);
  assert.match(run.output, /continues in the next scheduled run/);
});

test('kitCopy_isIdenticalToTheSource', () => {
  assert.equal(readFileSync(KIT_COPY, 'utf8'), readFileSync(SCRIPT, 'utf8'));
});
