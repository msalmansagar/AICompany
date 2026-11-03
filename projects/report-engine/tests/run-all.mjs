import { fileURLToPath } from 'node:url';
// Runs every browser-side test harness and reports one total.
//
// These cover the half of the engine that moved into the web resource under ADR-RPT-011 — formulas,
// transformations, layout rendering, conditional formatting and exports. The C# half is covered by
// `dotnet test src/Qdb.ReportEngine.sln` and the plugin's own suite; between them, both runtimes are
// tested. Each harness reads the real report-runtime.html and exercises the shipped code rather than
// a copy, so a change to the viewer that breaks behaviour fails here.
//
// Usage: node tests/run-all.mjs        (no arguments, no dependencies)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = fileURLToPath(new URL('.', import.meta.url));
const harnesses = readdirSync(here).filter(name => name.startsWith('test-') && name.endsWith('.mjs')).sort();

let failedSuites = 0;
let unfinished = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const harness of harnesses) {
  const run = spawnSync(process.execPath, [here + harness], { encoding: 'utf8' });
  const output = (run.stdout || '') + (run.stderr || '');
  const tally = /(\d+) passed, (\d+) failed/.exec(output);

  if (tally) {
    totalPassed += Number(tally[1]);
    totalFailed += Number(tally[2]);
  } else {
    unfinished++;
  }

  const ok = run.status === 0;
  if (!ok) failedSuites++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${harness.padEnd(24)} ${tally ? `${tally[1]} passed, ${tally[2]} failed` : 'no tally — see output'}`);

  // Only a failing suite prints its detail, so a green run stays readable.
  if (!ok) console.log(output.split('\n').filter(line => /FAIL|Error|error/.test(line)).slice(0, 12).map(l => '      ' + l).join('\n'));
}

/* A suite that CRASHES prints no tally, so counting only tallies reported "0 failed" for a run that
   had just lost an entire suite. The exit code was right and the summary was not, which is the same
   quiet-failure shape these suites exist to catch. */
console.log(`\n${harnesses.length} suites — ${totalPassed} passed, ${totalFailed} failed`
  + (unfinished ? ` — ${unfinished} suite(s) DID NOT FINISH` : ''));
process.exit(failedSuites ? 1 : 0);
