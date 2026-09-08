import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

// D5 — authored dataset bands. How a block PRESENTS — Fields or Table, title shown, hidden or
// overridden — is the author's, stored in layout.datasetLayout by alias. The data underneath is
// untouched, which is why exports keep the table whatever the band looks like.

const ENGINE = fileURLToPath(new URL('../prototype/report-engine-core.js', import.meta.url));
const html = readFileSync(ENGINE, 'utf8');

const NEEDED = [
  'NUMERIC', 'plural', 'truncationChip', 'TOTAL_LABELS', 'reduceTotal', 'numericCellValue',
  'formatTotalNumber', 'totalsRowHtml', 'totalsRowOf', 'totalsRowLabel', 'totalCellOf',
  'datasetBody', 'datasetRow', 'bandConfigFor', 'bandTitleOf', 'datasetFieldsHtml', 'datasetBlock',
  'BAND_WIDTH_SPANS', 'bandSpanOf', 'BAND_ICONS', 'bandIconSvg'
];

const api = new Function('esc',
  `${NEEDED.map(name => liftDeclaration(html, name)).join('\n')}
   return { bandConfigFor, datasetFieldsHtml, datasetBlock, bandSpanOf, bandIconSvg };`
)(value => String(value == null ? '' : value));

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

const dataset = {
  role: 'standalone', alias: 'b1', name: 'Applicant Profile',
  columns: [{ alias: 'fullname', label: 'Customer Name' }, { alias: 'sector', label: 'Sector' }],
  rows: [{ cells: { fullname: { text: 'Qatar National Bank' }, sector: { text: 'Banking' } } }],
  rowCount: 1, truncated: false, elapsedMs: 3
};

console.log('the band config is addressed by alias, like every authored layout fact');
{
  const def = { layout: { datasetLayout: { b1: { displayAs: 'fields' } } } };
  check('a block finds its band', api.bandConfigFor(def, dataset).displayAs === 'fields');
  check('no alias, no band', api.bandConfigFor(def, { ...dataset, alias: null }) === null);
  check('no authoring, no band', api.bandConfigFor({ layout: {} }, dataset) === null);
}

console.log('a Fields band is the Applicant Profile shape');
{
  const htmlOut = api.datasetBlock(dataset, null, () => '', null, { displayAs: 'fields' });
  check('labels and values render as a card', /band-card/.test(htmlOut) && htmlOut.includes('Customer Name') && htmlOut.includes('Qatar National Bank'), htmlOut);
  check('no table is drawn', !/table class/.test(htmlOut));

  const fixed = api.datasetFieldsHtml(dataset, { fieldColumns: 2 });
  check('the fields-per-row choice becomes the grid', fixed.includes('repeat(2,minmax(0,1fr))'), fixed.slice(0, 120));
}

console.log('the title is the author’s to keep, rename or remove');
{
  const kept = api.datasetBlock(dataset, null, () => '', null, null);
  check('no band keeps the dataset name', kept.includes('Applicant Profile'));
  const renamed = api.datasetBlock(dataset, null, () => '', null, { title: 'Group Exposure' });
  check('an override replaces it', renamed.includes('Group Exposure') && !renamed.includes('Applicant Profile'));
  // The row-count strip inside the table is the dataset's own meta line and stays; only the
  // band HEADING goes.
  const hidden = api.datasetBlock(dataset, null, () => '', null, { showTitle: false });
  check('hiding it removes the heading, not the data',
    !hidden.includes('<b>Applicant Profile</b>') && hidden.includes('Qatar National Bank'), hidden.slice(0, 160));
}

console.log('a band declares its width on the 12-column page (L1)');
{
  check('absent means the full page', api.bandSpanOf(null) === 12);
  check('half is six columns', api.bandSpanOf({ width: 'half' }) === 6);
  check('a third is four', api.bandSpanOf({ width: 'third' }) === 4);
  check('two thirds is eight', api.bandSpanOf({ width: 'twothirds' }) === 8);
  check('an unknown width falls back to full, never to broken CSS', api.bandSpanOf({ width: 'banana' }) === 12);

  const third = api.datasetBlock(dataset, null, () => '', null, { width: 'third' });
  check('the block carries its span', third.includes('grid-column:span 4'), third.slice(0, 120));
  const full = api.datasetBlock(dataset, null, () => '', null, null);
  check('no band means a full-width block', full.includes('grid-column:span 12'));
}

console.log('an authored icon dresses the title as panel chrome (L2)');
{
  const chromed = api.datasetBlock(dataset, null, () => '', null, { icon: 'shield' });
  check('the heading becomes the tinted bar', chromed.includes('band-chrome'), chromed.slice(0, 200));
  check('and carries the icon', chromed.includes('band-icon'));
  const plain = api.datasetBlock(dataset, null, () => '', null, { title: 'Group Exposure' });
  check('no icon keeps the plain heading', !plain.includes('band-chrome'));
  check('an unknown icon renders nothing rather than a broken image', api.bandIconSvg({ icon: 'banana' }) === '');
}

console.log('the designer carries a byte-identical icon map');
{
  const designer = readFileSync(new URL('../prototype/report-designer.html', import.meta.url), 'utf8');
  const mapOf = (source, name) => {
    const at = source.indexOf(`const ${name} = {`);
    return source.slice(at + `const ${name} = `.length, source.indexOf('};', at) + 1);
  };
  check('BAND_ICONS and PREVIEW_BAND_ICONS do not drift',
    mapOf(html, 'BAND_ICONS') === mapOf(designer, 'PREVIEW_BAND_ICONS'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
