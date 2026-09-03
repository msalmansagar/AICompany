import { fileURLToPath } from 'node:url';
const CORE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
// What a cell with nothing in it renders as.
//
// Blanks used to be dressed up as real values, and the worst of them was silent: an absent amount
// rendered "QAR 0.00", a number a reader acts on and cannot tell from a genuine zero. An absent
// date rendered the literal "null" at runtime — String(null) split on a hyphen — and "undefined" in
// the designer preview, where a missing cell arrives as undefined rather than null. An absent
// decimal rendered "0", or "NaN" when missing.
//
// The pair that matters in every case below is blank versus genuine zero. A guard that swallowed
// both would trade one silent wrong number for another.
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

const core = readFileSync(CORE, 'utf8');
const designer = readFileSync(DESIGNER, 'utf8');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const EM_DASH = '—';

/* buildPreviewBody defines fmt and disp inside itself, so they are lifted out of its source rather
   than exported — which also proves the shipped file is what is under test. */
function formattersFrom(source, functionName) {
  const body = liftDeclaration(source, functionName);
  const helper = liftDeclaration(source, 'isBlankCell') + '\n' + liftDeclaration(source, 'EMPTY_CELL');
  const fmtLine = /^\s*const fmt = .*$/m.exec(body);
  const dispLine = /^\s*const disp = .*$/m.exec(body);
  if (!fmtLine || !dispLine) throw new Error('fmt/disp not found in ' + functionName);
  /* The designer's buildPreviewBody now aliases fmt to the shared previewCellText, so the named
     formatter has to come with it — lifting the `const fmt` line alone is a ReferenceError. */
  const shared = /^function previewCellText\s*\(/m.test(source) ? liftDeclaration(source, 'previewCellText') : '';
  return new Function('money', 'tr', `
    ${helper}
    ${shared}
    const T = s => tr(s, "en");
    const num = c => ["Currency","Decimal","Whole number"].includes(c.type);
    ${fmtLine[0]}
    ${dispLine[0]}
    return { fmt, disp };`)(
      n => 'QAR ' + (+n).toFixed(2),
      s => s);
}

const esc = s => String(s ?? '');
const engine = formattersFrom(core, 'buildPreviewBody');
const shown = (api, type, value) => esc(api.disp({ type }, value));

const TYPES = ['Currency', 'Decimal', 'Whole number', 'Date/Time', 'Text', 'Option set'];
const BLANKS = [['null', null], ['undefined', undefined], ['an empty string', '']];

console.log('the engine: every blank reads as blank');
for (const type of TYPES) {
  for (const [label, value] of BLANKS) {
    check(`${type} with ${label}`, shown(engine, type, value) === EM_DASH,
      JSON.stringify(shown(engine, type, value)));
  }
}

console.log('\nand a genuine zero is not blank');
// The whole risk of the guard: swallowing a real zero would replace one wrong number with another.
check('a zero amount still shows as money', shown(engine, 'Currency', 0) === 'QAR 0.00',
  shown(engine, 'Currency', 0));
check('a zero decimal still shows 0', shown(engine, 'Decimal', 0) === '0');
check('a zero count still shows 0', shown(engine, 'Whole number', 0) === '0');
// A zero that arrived as text is still a zero, not an absence.
check('the string "0" is not treated as blank', shown(engine, 'Text', '0') === '0');

console.log('\nand real values are untouched');
check('an amount formats as money', shown(engine, 'Currency', 1234.5) === 'QAR 1234.50');
check('a decimal keeps two places', shown(engine, 'Decimal', 12.345) === '12.35');
check('a date reverses to day/month/year', shown(engine, 'Date/Time', '2026-08-19') === '19/08/2026');
check('text passes through', shown(engine, 'Text', 'Acme') === 'Acme');

console.log('\nthe exact strings that used to leak are gone');
// These are what the defect actually put on screen, taken from the live designer.
const leaks = TYPES.flatMap(type => BLANKS.map(([, value]) => shown(engine, type, value)));
check('no cell says "null"', !leaks.includes('null'));
check('no cell says "undefined"', !leaks.includes('undefined'));
check('no cell says "NaN"', !leaks.includes('NaN'));
check('no blank amount claims to be zero', !leaks.includes('QAR 0.00'));

console.log('\nthe designer carries its own renderers, and they agree');
// Two more copies live in the designer's own scope: its buildPreviewBody and the master-detail
// header body. A fix applied to one and not the others is the failure mode here.
const designerPreview = formattersFrom(designer, 'buildPreviewBody');
const designerHeader = formattersFrom(designer, 'buildHeaderDetailBody');
for (const [name, api] of [['buildPreviewBody', designerPreview], ['buildHeaderDetailBody', designerHeader]]) {
  check(`${name} blanks a null amount`, shown(api, 'Currency', null) === EM_DASH);
  check(`${name} blanks a missing date`, shown(api, 'Date/Time', undefined) === EM_DASH);
  check(`${name} keeps a genuine zero`, shown(api, 'Currency', 0) === 'QAR 0.00');
}

console.log('\nboth files guard every formatter they define');
for (const [name, text] of [['report-engine-core.js', core], ['report-designer.html', designer]]) {
  const defined = (text.match(/const fmt = \(c,v\) =>/g) || []).length;
  const guarded = (text.match(/const fmt = \(c,v\) => isBlankCell\(v\) \? EMPTY_CELL/g) || []).length;
  check(`${name}: ${guarded}/${defined} guarded`, defined > 0 && defined === guarded);
  check(`${name} defines the blank test`, /const isBlankCell = value =>/.test(text));
}

/* The designer's inline formatter was extracted so the dataset blocks format identically to the
   layouts. One shared formatter is the point — but only while it still guards blanks, so the count
   above is no longer the whole story for that file. */
console.log('\nthe shared formatter is guarded too');
check('previewCellText tests for blank first', /^function previewCellText[\s\S]{0,200}?isBlankCell\(value\)\) return EMPTY_CELL/m.test(designer));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
