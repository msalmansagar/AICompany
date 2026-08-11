import { fileURLToPath } from 'node:url';
const VIEWER = fileURLToPath(new URL('../prototype/report-runtime.html', import.meta.url));
// Runs the viewer's exporters against a real executed result, with the vendored libraries loaded
// from disk, and checks each produces a genuinely valid file rather than merely not throwing.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROTO = fileURLToPath(new URL('../prototype', import.meta.url));
const html = readFileSync(`${PROTO}/report-runtime.html`, 'utf8');
const source = html.slice(html.indexOf('/* ---------------- exports ----------------'), html.indexOf('/* ---------------- identity ----------------'));

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

// --- a browser-ish environment the exporters can run in -------------------------------------
const saved = [];
globalThis.window = globalThis;
globalThis.Blob = class { constructor(parts, opts){ this.parts = parts; this.type = (opts||{}).type; } };
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL(){} };
globalThis.document = {
  head: { appendChild(){} },
  createElement: tag => tag === 'canvas' ? makeCanvas() : { style:{}, set href(v){}, set download(v){ this._n = v; }, click(){}, remove(){} },
  body: { appendChild(el){ saved.push(el); }, }
};
function makeCanvas(){
  return { width:0, height:0,
    getContext: () => ({ scale(){}, fillRect(){}, fillText(){}, measureText: t => ({ width: String(t).length * 7 }), set fillStyle(v){}, set font(v){} }),
    toBlob: cb => cb(new globalThis.Blob([new Uint8Array([0x89,0x50,0x4e,0x47])], { type:'image/png' })) };
}

// Capture what saveBlob would have downloaded.
const downloads = [];
const api = new Function('esc', 'state', 'toast', 'captureBlob', `
  ${source}
  saveBlob = (blob, filename) => captureBlob(blob, filename);
  return { exportCsv, exportExcel, exportPdf, exportPng, exportRows, loadLibrary, EXPORT_FORMATS };
`)(s => String(s ?? ''), { current: { def: { name: 'Active Accounts', reportCode: 'RPT-EXEC-001' } } },
   () => {}, (blob, filename) => downloads.push({ blob, filename }));

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

console.log('\nmenu');
check('offers exactly the formats implemented', Object.keys(api.EXPORT_FORMATS).join(',') === 'csv,excel,pdf,image');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
