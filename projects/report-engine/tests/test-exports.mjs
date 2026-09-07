import { fileURLToPath } from 'node:url';
const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
// Runs the viewer's exporters against a real executed result, with the vendored libraries loaded
// from disk, and checks each produces a genuinely valid file rather than merely not throwing.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { liftDeclaration } from './engine-harness.mjs';

const PROTO = fileURLToPath(new URL('../prototype', import.meta.url));
const html = readFileSync(`${PROTO}/report-engine-core.js`, 'utf8');
const exportsSection = html.slice(html.indexOf('/* ---------------- exports ----------------'), html.indexOf('/* ---------------- identity ----------------'));

/* The exporters read the result through the dataset normaliser, which lives outside this section.
   Lifted from the engine rather than stubbed here: a stub would answer for code the browser never
   runs, and the whole point of these suites is that they exercise the shipped path. */
const normaliser = ['datasetsOf', 'rootDatasetOf', 'omittedDatasetNames',
  // tableOf carries the authored totals row into every export (D3), so the totals module rides too.
  'TOTAL_LABELS', 'authoredTotalsFor', 'totalsRowOf', 'totalsRowLabel', 'totalCellOf',
  'reduceTotal', 'numericCellValue', 'formatTotalNumber']
  .map(name => liftDeclaration(html, name)).join('\n');
const source = `${normaliser}\n${exportsSection}`;

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

// --- a browser-ish environment the exporters can run in -------------------------------------
const saved = [];
globalThis.window = globalThis;
// jsPDF's UMD reads navigator while loading. Node 21+ has a global one and older Node does not, so
// without this the suite passes locally and fails in CI — which is the reverse of useful.
// defineProperty, not assignment: where it does exist it is getter-only.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node', language: 'en' }, configurable: true, writable: true
});
globalThis.Blob = class { constructor(parts, opts){ this.parts = parts; this.type = (opts||{}).type; } };
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL(){} };
globalThis.document = {
  head: { appendChild(){} },
  createElement: tag => tag === 'canvas' ? makeCanvas() : { style:{}, set href(v){}, set download(v){ this._n = v; }, click(){}, remove(){} },
  body: { appendChild(el){ saved.push(el); }, }
};
/* Every drawing operation, so the PNG's LAYOUT can be checked without a real canvas. The old stub
   swallowed each call and returned fixed magic bytes, so "the PNG is valid" was true of any PNG at
   all — including one whose second table was drawn off the bottom of the image. */
let painted = [];

function makeCanvas(){
  const canvas = { width:0, height:0,
    toBlob: cb => cb(new globalThis.Blob([new Uint8Array([0x89,0x50,0x4e,0x47])], { type:'image/png' })) };
  // A real 2D context carries a back-reference to its canvas, and the PNG exporter uses it
  // (ctx.canvas.toBlob). A stub without it fails on code that is correct in a browser.
  canvas.getContext = () => ({
    canvas,
    scale(){},
    fillRect: (x, y, w, h) => painted.push({ op:'rect', x, y, w, h, canvas }),
    fillText: (text, x, y) => painted.push({ op:'text', text, x, y, canvas }),
    measureText: t => ({ width: String(t).length * 7 }),
    set fillStyle(v){}, set font(v){}, set textAlign(v){}, set direction(v){}
  });
  return canvas;
}

// Capture what saveBlob would have downloaded, and what the user would have been told.
const downloads = [];
const toasts = [];
// Direction is injected rather than stubbed away, so the right-to-left paths are exercised too:
// the sheet direction Excel needs, and the Arabic font a PDF needs. Both were shipped broken once.
let rightToLeft = false;
// Injected as a parameter, so tests change the open report by MUTATING this reference.
const harnessState = { current: { def: { name: 'Active Accounts', reportCode: 'RPT-EXEC-001' } } };
const api = new Function('esc', 'state', 'toast', 'captureBlob', 'isReportRtl', 'reportLanguage', `
  ${source}
  saveBlob = (blob, filename) => captureBlob(blob, filename);
  return { exportCsv, exportExcel, exportPdf, exportPng, exportRows, loadLibrary, EXPORT_FORMATS };
`)(s => String(s ?? ''), harnessState,
   message => toasts.push(message), (blob, filename) => downloads.push({ blob, filename }),
   () => rightToLeft, () => rightToLeft ? 'ar' : 'en');

// Load the vendored libraries the way the browser would.
new Function(readFileSync(`${PROTO}/vendor/xlsx.mini.min.js`, 'utf8')).call(globalThis);
new Function(readFileSync(`${PROTO}/vendor/jspdf.umd.min.js`, 'utf8')).call(globalThis);
new Function(readFileSync(`${PROTO}/vendor/jspdf.plugin.autotable.min.js`, 'utf8')).call(globalThis);
check('SheetJS registered', !!globalThis.XLSX);
check('jsPDF registered', !!(globalThis.jspdf && globalThis.jspdf.jsPDF));
check('autoTable registered', typeof globalThis.jspdf?.jsPDF?.API?.autoTable === 'function');

const result = {
  reportName: 'Active Accounts', rowCount: 3,
  columns: [
    { alias:'name', label:'Customer' }, { alias:'accountnumber', label:'Account' }, { alias:'amount', label:'Amount' }
  ],
  rows: [
    ['Al Khalij Commercial Bank','ACC-1001','QAR 125,000.50'],
    ['Qatar National Bank','ACC-1004','QAR 98,000.00'],
    ['شركة الدوحة','ACC-1009','QAR 41,000.00']   // non-Latin, to catch encoding assumptions
  ].map(([a,b,c]) => ({ cells: { name:{value:a,text:a}, accountnumber:{value:b,text:b}, amount:{value:c,text:c} } }))
};

/** The text drawn in a PDF, inflating each content stream. Enough to prove what reached the page. */
function pdfText(bytes) {
  const latin = bytes.toString('latin1');
  let text = '';
  const marker = /stream\r?\n/g;
  let found;
  while ((found = marker.exec(latin)) !== null) {
    const start = found.index + found[0].length;
    const chunk = bytes.slice(start, latin.indexOf('endstream', start));
    try { text += inflateSync(chunk).toString('latin1'); }
    catch { text += chunk.toString('latin1'); }
  }
  return text;
}

const bytesOf = blob => {
  const out = [];
  for (const part of blob.parts) {
    if (typeof part === 'string') out.push(...Buffer.from(part, 'utf8'));
    else if (part instanceof Uint8Array) out.push(...part);
    else if (part instanceof ArrayBuffer) out.push(...new Uint8Array(part));
    else if (Buffer.isBuffer(part)) out.push(...part);
  }
  return Buffer.from(out);
};

console.log('\nCSV');
downloads.length = 0; api.exportCsv(result, 'report');
let file = downloads[0]; let bytes = bytesOf(file.blob);
check('named .csv', file.filename === 'report.csv');
check('has a UTF-8 BOM', bytes.slice(0,3).toString('hex') === 'efbbbf');
check('quotes and headers present', bytes.toString('utf8').includes('"Customer","Account","Amount"'));
check('keeps non-Latin text', bytes.toString('utf8').includes('شركة الدوحة'));

console.log('\nExcel');
downloads.length = 0; await api.exportExcel(result, 'report');
file = downloads[0]; bytes = bytesOf(file.blob);
check('named .xlsx', file.filename === 'report.xlsx');
check('is a real ZIP (PK header)', bytes.slice(0,2).toString() === 'PK');
check('contains the workbook part', bytes.toString('latin1').includes('xl/worksheets'));
writeFileSync(join(tmpdir(), 'export-check.xlsx'), bytes);   // inspectable, but not in the repo

console.log('\nPDF');
downloads.length = 0; await api.exportPdf(result, 'report');
file = downloads[0]; bytes = bytesOf(file.blob);
check('named .pdf', file.filename === 'report.pdf');
check('is a real PDF (%PDF header)', bytes.slice(0,4).toString() === '%PDF');
check('has an EOF marker', bytes.slice(-8).toString().includes('EOF'));
writeFileSync(join(tmpdir(), 'export-check.pdf'), bytes);   // inspectable, but not in the repo

console.log('\nPNG');
downloads.length = 0; await api.exportPng(result, 'report');
file = downloads[0]; bytes = bytesOf(file.blob);
check('named .png', file.filename === 'report.png');
check('is a real PNG (magic bytes)', bytes.slice(0,4).toString('hex') === '89504e47');

// ADD-002: a term sheet is one parent with its child tables. An export carrying only the first
// table hands the customer an incomplete document, so every format that CAN hold more than one table
// now does. CSV cannot — it is one table by definition — so it stays the root and says so elsewhere.
const multi = {
  reportName: 'Termsheet', reportId: 'r1',
  datasets: [
    { id: 'r1', name: 'Termsheet', role: 'root', status: 'ok', rowCount: 1, elapsedMs: 5,
      columns: [{ alias: 'name', label: 'Customer' }],
      rows: [{ cells: { name: { value: 'QNB', text: 'QNB' } } }] },
    { id: 'd2', name: 'Requested Facilities', role: 'standalone', status: 'ok', rowCount: 2, elapsedMs: 8,
      columns: [{ alias: 'ftype', label: 'Facility' }, { alias: 'amt', label: 'Amount' }],
      rows: [
        { cells: { ftype: { value: 'Term Loan', text: 'Term Loan' }, amt: { value: 1, text: '12,000,000' } } },
        { cells: { ftype: { value: 'Overdraft', text: 'Overdraft' }, amt: { value: 2, text: '2,500,000' } } }
      ] },
    { id: 'd3', name: 'Termsheet Conditions', role: 'standalone', status: 'ok', rowCount: 1, elapsedMs: 3,
      columns: [{ alias: 'cond', label: 'Condition' }],
      rows: [{ cells: { cond: { value: 'DSR', text: 'DSR >= 1.25x' } } }] }
  ]
};

console.log('\nmulti-dataset — Excel gets a sheet per dataset');
downloads.length = 0; await api.exportExcel(multi, 'termsheet');
bytes = bytesOf(downloads[0].blob);
{
  const book = XLSX.read(bytes, { type: 'buffer' });
  check('one sheet per dataset', book.SheetNames.length === 3, book.SheetNames.join('|'));
  check('named after the datasets',
    book.SheetNames.join('|') === 'Termsheet|Requested Facilities|Termsheet Conditions', book.SheetNames.join('|'));
  const facilities = XLSX.utils.sheet_to_json(book.Sheets['Requested Facilities'], { header: 1 });
  check('the block carries its own header', String(facilities[0]) === 'Facility,Amount', String(facilities[0]));
  check('and its own rows', facilities.length === 3, String(facilities.length));
  check('the root sheet holds the root record',
    XLSX.utils.sheet_to_json(book.Sheets['Termsheet'], { header: 1 })[1][0] === 'QNB');
}

console.log('\nmulti-dataset — PDF and PNG carry every dataset');
downloads.length = 0; await api.exportPdf(multi, 'termsheet');
bytes = bytesOf(downloads[0].blob);
check('the PDF is valid', bytes.slice(0, 4).toString() === '%PDF');
writeFileSync(join(tmpdir(), 'export-check-multi.pdf'), bytes);
{
  /* "It is a valid PDF" is the assertion that once let a broken Arabic build pass. Decode the
     content streams and look for the actual datasets: a PDF carrying only the first table is still
     a perfectly valid PDF. */
  const text = pdfText(bytes);
  for (const wanted of ['Requested Facilities', 'Termsheet Conditions', 'Term Loan', 'Overdraft', 'DSR']) {
    check(`the PDF carries "${wanted}"`, text.includes(wanted));
  }
}
downloads.length = 0; await api.exportPng(multi, 'termsheet');
bytes = bytesOf(downloads[0].blob);
check('the PNG is valid', bytes.slice(0, 4).toString('hex') === '89504e47');

console.log('\nmulti-dataset — CSV names every block it could not carry');
{
  // A block named "0" is falsy; filter(Boolean) once dropped it from its own omission warning.
  const zeroNamed = { ...multi, datasets: [multi.datasets[0],
    { ...multi.datasets[1], name: '0' }, multi.datasets[2]] };
  downloads.length = 0; toasts.length = 0;
  await api.exportCsv(zeroNamed, 'termsheet');
  const warning = toasts.find(message => String(message).includes('not included')) || '';
  check('the warning lists the block named "0"', String(warning).includes('0'), String(warning));
  check('and the other omitted block', String(warning).includes('Termsheet Conditions'), String(warning));
}

// D6 — the print page. The page the author set up is the page the PDF is, and every page carries
// the document's chrome: repeated header, page number, watermark. Decoded from the content
// streams, because "it is a valid PDF" says nothing about what is on its pages.
console.log('\nPDF — the authored print page');
{
  const defaultDef = harnessState.current.def;
  harnessState.current.def = { name: 'Credit Proposal', layout: {
    pageSize: 'Letter', orientation: 'Portrait', margins: 'Narrow', watermark: 'CONFIDENTIAL'
  } };
  downloads.length = 0; await api.exportPdf(multi, 'termsheet');
  const pageBytes = bytesOf(downloads[0].blob);
  const raw = pageBytes.toString('latin1');
  const text = pdfText(pageBytes);
  // Letter portrait is 612×792pt; the MediaBox is the proof the authored page shipped.
  check('the page is Letter portrait, as authored', /MediaBox\s*\[\s*0\s+0\s+612\.?\d*\s+792\.?\d*/.test(raw), (raw.match(/MediaBox[^\]]*\]/) || [''])[0]);
  check('the repeated header carries the report name', text.includes('Credit Proposal'));
  check('the footer numbers its pages', /Page 1 of/.test(text), text.slice(0, 200));
  check('the watermark is on the page', text.includes('CONFIDENTIAL'));
  harnessState.current.def = defaultDef;

  downloads.length = 0; await api.exportPdf(multi, 'termsheet');
  const plain = pdfText(bytesOf(downloads[0].blob));
  check('no definition still numbers pages (defaults on)', /Page 1 of/.test(plain));
  check('and carries no watermark nobody authored', !plain.includes('CONFIDENTIAL'));
}

console.log('\nmulti-dataset — CSV stays one table, by definition');
downloads.length = 0; await api.exportCsv(multi, 'termsheet');
{
  const text = bytesOf(downloads[0].blob).toString('utf8');
  check('it holds the root', text.includes('QNB'));
  check('and not the blocks', !text.includes('Term Loan'), text.slice(0, 120));
}

console.log('\nmulti-dataset — PNG layout, not just a valid file');
{
  painted = [];
  await api.exportPng(multi, 'termsheet');
  // The canvas the exporter drew on is the one it took a 2D context from; the measuring canvas
  // never draws, so anything recorded belongs to the image.
  const target = painted[0].canvas;
  const scale = 2;                                     // PNG_SCALE — the canvas is sized at 2x
  const height = target.height / scale;
  const width = target.width / scale;

  const lowest = painted.reduce((max, op) => Math.max(max, op.op === 'rect' ? op.y + op.h : op.y), 0);
  const widest = painted.reduce((max, op) => Math.max(max, op.op === 'rect' ? op.x + op.w : op.x), 0);
  check('nothing is drawn below the image', lowest <= height, `lowest ${lowest} vs height ${height}`);
  check('nothing is drawn past the right edge', widest <= width, `widest ${widest} vs width ${width}`);
  check('the image is not mostly empty', lowest > height * 0.6, `content ends at ${lowest} of ${height}`);

  const texts = painted.filter(op => op.op === 'text').map(op => String(op.text));
  check('every dataset title is drawn',
    ['Termsheet', 'Requested Facilities', 'Termsheet Conditions'].every(name => texts.includes(name)),
    texts.join(' | '));
  check('every dataset\'s rows are drawn',
    ['QNB', 'Term Loan', 'Overdraft', 'DSR >= 1.25x'].every(value => texts.includes(value)),
    texts.join(' | '));

  // Each table must occupy its own vertical band; overlapping bands mean one was drawn on top of
  // another, which is what a stacked layout gets wrong when the cursor is not carried forward.
  /* The bar behind a table's header must be as wide as that table's columns, not as the image. The
     canvas is sized for the WIDEST dataset, so filling to its edge painted a band of colour past the
     last cell of every narrower table — a valid PNG that looks broken. */
  const bars = painted.filter(op => op.op === 'rect' && op.h === 34);   // PNG_HEADER_HEIGHT
  check('a header bar is drawn per dataset', bars.length === 3, String(bars.length));
  check('no header bar runs to the image edge',
    bars.every(bar => bar.x + bar.w <= width - 6), bars.map(b => `${b.x}+${b.w} of ${width}`).join(' | '));
  check('the bars are not all the same width — each matches its own table',
    new Set(bars.map(bar => bar.w)).size > 1, bars.map(b => b.w).join(','));

  const yOf = label => (painted.find(op => op.op === 'text' && op.text === label) || {}).y;
  check('the blocks are stacked in order',
    yOf('Termsheet') < yOf('Requested Facilities') && yOf('Requested Facilities') < yOf('Termsheet Conditions'),
    `${yOf('Termsheet')} / ${yOf('Requested Facilities')} / ${yOf('Termsheet Conditions')}`);
  check('rows sit under their own title',
    yOf('Term Loan') > yOf('Requested Facilities') && yOf('Term Loan') < yOf('Termsheet Conditions'),
    `${yOf('Requested Facilities')} < ${yOf('Term Loan')} < ${yOf('Termsheet Conditions')}`);
}

console.log('\nmenu');
check('offers exactly the formats implemented', Object.keys(api.EXPORT_FORMATS).join(',') === 'csv,excel,pdf,image');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
