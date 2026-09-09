import { fileURLToPath } from 'node:url';
import { loadEngine } from './engine-harness.mjs';

// DV — the document view: the authored print page, on screen.
//
// Pagination is deliberately two-phase so the half that DECIDES is testable here: the browser
// measures heights, and docPlanPages deals blocks onto pages from numbers alone. These tests drive
// the shipped planner with synthetic heights — including the pathological ones (a row taller than
// the page, a block taller than the page) that must overflow visibly rather than loop.

const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

const { api } = loadEngine({
  enginePath: ENGINE,
  section: null,
  exports: ['docPageBox', 'docPlanPages', 'docPageChromeHtml'],
  seed: ['docPageBox', 'docPlanPages', 'docPageChromeHtml'],
  globals: { esc },
  smoke: built => {
    built.docPageBox({ format: 'a4', orientation: 'portrait', margin: 40, showHeader: true, pageNumber: true, footerText: '' });
    // Every planner path: a fitting atom, a table split by rows, a band grid split by visual rows.
    built.docPlanPages([
      { kind: 'atom', h: 100 },
      { kind: 'table', h: 5000, leadH: 60, headH: 24, rowHeights: [40, 40, 40] },
      { kind: 'grid', h: 900, rows: [{ h: 300, els: [] }] }
    ], 400);
    built.docPageChromeHtml(
      { showHeader: true, genDate: true, pageNumber: true, footerText: 'x', watermark: 'w' },
      { name: 'R', reportCode: 'C' }, 1, 2);
  }
});

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

console.log('page geometry follows the authored setup');
const a4 = api.docPageBox({ format: 'a4', orientation: 'portrait', margin: 40, showHeader: true, pageNumber: true, footerText: '' });
check('a4 portrait is 794×1123 css px', a4.width === 794 && a4.height === 1123);
check('40pt margins become 53px', a4.margin === 53);
check('content height loses margins, header and footer', a4.contentHeight === 1123 - 106 - 52 - 30);
const letter = api.docPageBox({ format: 'letter', orientation: 'landscape', margin: 24, showHeader: false, pageNumber: false, footerText: '' });
check('letter landscape swaps the axes', letter.width === 1056 && letter.height === 816);
check('no header and no footer reserve nothing', letter.headH === 0 && letter.footH === 0);
const unknown = api.docPageBox({ format: 'nope', orientation: 'portrait', margin: 40, showHeader: true, pageNumber: true, footerText: '' });
check('an unknown format falls back to a4', unknown.width === 794);
check('footer text alone still reserves the footer', api.docPageBox({ format: 'a4', orientation: 'portrait', margin: 40, showHeader: false, pageNumber: false, footerText: 'Confidential' }).footH === 30);

console.log('\nthe planner deals blocks onto pages');
const plan1 = api.docPlanPages([{ kind: 'atom', h: 120 }, { kind: 'atom', h: 200 }], 400);
check('blocks that fit share one page', plan1.length === 1 && plan1[0].length === 2);
const plan2 = api.docPlanPages([{ kind: 'atom', h: 300 }, { kind: 'atom', h: 500 }], 400);
check('a block that no longer fits starts the next page', plan2.length === 2 && plan2[1][0].h === 500);
const plan3 = api.docPlanPages([{ kind: 'atom', h: 900 }], 400);
check('a block taller than the page still lands — overflow, not loss', plan3.length === 1 && plan3[0].length === 1);

console.log('\ntables split by rows');
const table = { kind: 'table', h: 1100, leadH: 50, headH: 20, rowHeights: Array(10).fill(100) };
const plan4 = api.docPlanPages([table], 400);
const chunks = plan4.flat();
check('a long table becomes row chunks across pages', plan4.length === 4, `pages: ${plan4.length}`);
check('only the first chunk carries the block heading', chunks.filter(c => c.first).length === 1 && chunks[0].first === true);
check('every row lands exactly once', chunks.reduce((n, c) => n + (c.to - c.from), 0) === 10);
check('later chunks reserve the repeated table head', chunks[1].h === 20 + 300, `h: ${chunks[1].h}`);
const tallRow = api.docPlanPages([{ kind: 'table', h: 1200, leadH: 0, headH: 20, rowHeights: [1000] }], 400);
check('a row taller than the page terminates with the row placed', tallRow.flat().reduce((n, c) => n + (c.to - c.from), 0) === 1);
const fits = api.docPlanPages([{ kind: 'table', h: 200, leadH: 50, headH: 20, rowHeights: [50, 50] }], 400);
check('a table that fits is never split', fits.length === 1 && fits[0][0].kind === 'block');

console.log('\nband grids split by visual rows');
const grid = { kind: 'grid', h: 500, rows: [{ h: 200, els: [] }, { h: 300, els: [] }] };
const plan5 = api.docPlanPages([grid], 400);
check('grid rows that overflow start a new grid shell on the next page', plan5.length === 2);
check('each page carries a gridrows piece', plan5.every(p => p[0].kind === 'gridrows'));
check('the rows are dealt exactly once', plan5.flat().reduce((n, p) => n + p.rows.length, 0) === 2);

console.log('\npage chrome follows the same toggles the PDF obeys');
const setup = { showHeader: true, genDate: true, pageNumber: true, footerText: 'Confidential', watermark: 'DRAFT' };
const chrome = api.docPageChromeHtml(setup, { name: 'Disbursement <Report>', reportCode: 'R-2026-04871' }, 2, 3);
check('the header carries the escaped title', chrome.includes('Disbursement &lt;Report&gt;'));
check('the reference lands in the header meta', chrome.includes('R-2026-04871'));
check('the page count reads Page 2 of 3', chrome.includes('Page 2 of 3'));
check('the footer carries the authored text', chrome.includes('Confidential'));
check('the watermark is present when authored', chrome.includes('doc-watermark') && chrome.includes('DRAFT'));
const bare = api.docPageChromeHtml({ showHeader: false, genDate: false, pageNumber: false, footerText: '', watermark: '' }, { name: 'R' }, 1, 1);
check('nothing authored means no header, footer or watermark', !bare.includes('doc-page-head') && !bare.includes('doc-page-foot') && !bare.includes('doc-watermark'));
check('the body container is always present', bare.includes('doc-page-body'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
