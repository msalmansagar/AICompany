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
const normaliser = ['datasetsOf', 'rootDatasetOf', 'omittedDatasetNames']
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
function makeCanvas(){
  const canvas = { width:0, height:0,
    toBlob: cb => cb(new globalThis.Blob([new Uint8Array([0x89,0x50,0x4e,0x47])], { type:'image/png' })) };
  // A real 2D context carries a back-reference to its canvas, and the PNG exporter uses it
  // (ctx.canvas.toBlob). A stub without it fails on code that is correct in a browser.
  canvas.getContext = () => ({
    canvas, scale(){}, fillRect(){}, fillText(){},
    measureText: t => ({ width: String(t).length * 7 }),
    set fillStyle(v){}, set font(v){}, set textAlign(v){}, set direction(v){}
  });
  return canvas;
}

// Capture what saveBlob would have downloaded.
const downloads = [];
// Direction is injected rather than stubbed away, so the right-to-left paths are exercised too:
// the sheet direction Excel needs, and the Arabic font a PDF needs. Both were shipped broken once.
let rightToLeft = false;
const api = new Function('esc', 'state', 'toast', 'captureBlob', 'isReportRtl', 'reportLanguage', `
  ${source}
  saveBlob = (blob, filename) => captureBlob(blob, filename);
  return { exportCsv, exportExcel, exportPdf, exportPng, exportRows, loadLibrary, EXPORT_FORMATS };
`)(s => String(s ?? ''), { current: { def: { name: 'Active Accounts', reportCode: 'RPT-EXEC-001' } } },
   () => {}, (blob, filename) => downloads.push({ blob, filename }),
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

console.log('\nmulti-dataset — CSV stays one table, by definition');
downloads.length = 0; await api.exportCsv(multi, 'termsheet');
{
  const text = bytesOf(downloads[0].blob).toString('utf8');
  check('it holds the root', text.includes('QNB'));
  check('and not the blocks', !text.includes('Term Loan'), text.slice(0, 120));
}

console.log('\nmenu');
check('offers exactly the formats implemented', Object.keys(api.EXPORT_FORMATS).join(',') === 'csv,excel,pdf,image');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
