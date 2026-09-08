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
  'BAND_WIDTH_SPANS', 'bandSpanOf', 'BAND_ICONS', 'bandIconSvg',
  'CHART_COLORS', 'compactNumber', 'donutChartHtml', 'barChartHtml', 'progressChartHtml', 'CHART_BAND_KINDS', 'chartEntriesOf', 'cardsChartHtml', 'cardEntriesOf', 'ISO_DATE', 'inferColumnType'
];

const api = new Function('esc',
  `${NEEDED.map(name => liftDeclaration(html, name)).join('\n')}
   return { bandConfigFor, datasetFieldsHtml, datasetBlock, bandSpanOf, bandIconSvg, compactNumber, donutChartHtml, barChartHtml, progressChartHtml, chartEntriesOf, cardsChartHtml, cardEntriesOf, inferColumnType, datasetBody };`
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

console.log('a band can chart its rows (L3)');
{
  const facilities = {
    role: 'standalone', alias: 'b9', name: 'Facility Exposure',
    columns: [{ alias: 'kind', label: 'Kind' }, { alias: 'amount', label: 'Amount' }],
    rows: [
      { cells: { kind: { text: 'Available' }, amount: { value: 30100000, text: '30.1M' } } },
      { cells: { kind: { text: 'Utilized' }, amount: { value: 4900000, text: '4.9M' } } }
    ],
    rowCount: 2, truncated: false, elapsedMs: 2
  };

  check('35 000 000 reads as 35.0M', api.compactNumber(35000000) === '35.0M');
  check('1 500 reads as 1.5K', api.compactNumber(1500) === '1.5K');
  check('a small number stays itself', api.compactNumber(86) === '86');
  check('garbage reads as nothing', api.compactNumber('banana') === '');

  const entries = api.chartEntriesOf(facilities, {});
  check('entries infer value and label columns', entries.length === 2 && entries[0].label === 'Available' && entries[0].value === 30100000, JSON.stringify(entries));

  const donut = api.datasetBlock(facilities, null, () => '', null, { displayAs: 'donut' });
  check('a donut band renders segments and the compact total', /chart-donut/.test(donut) && donut.includes('35.0M'), donut.slice(0, 200));
  check('its legend keeps the authored value text', donut.includes('30.1M') && donut.includes('Utilized'));

  const bars = api.datasetBlock(facilities, null, () => '', null, { displayAs: 'bars' });
  check('a bar band renders a column per row', (bars.match(/chart-bar-col/g) || []).length === 2, bars.slice(0, 160));

  const progress = api.datasetBlock(facilities, null, () => '', null, { displayAs: 'progress' });
  check('a progress band renders a track per row', (progress.match(/chart-track/g) || []).length === 2);
  check('the widest row fills its track', progress.includes('width:100%'), progress);

  // Nothing numeric: the chart falls back to the table rather than drawing an empty ring.
  const textual = api.datasetBlock(dataset, null, () => '', null, { displayAs: 'donut' });
  check('a chart with nothing numeric falls back to the table', /table class/.test(textual), textual.slice(0, 160));
}

console.log('the designer carries byte-identical chart builders');
{
  const designer = readFileSync(new URL('../prototype/report-designer.html', import.meta.url), 'utf8');
  const declarationOf = (source, opener, closer) => {
    const at = source.indexOf(opener);
    return at < 0 ? '(missing)' : source.slice(at, source.indexOf(closer, at) + closer.length);
  };
  for (const [opener, closer] of [
    ['const CHART_COLORS', '];'],
    ['const compactNumber', '};'],
    ['function donutChartHtml', '\n}'],
    ['function barChartHtml', '\n}'],
    ['function progressChartHtml', '\n}'],
    ['function cardsChartHtml', '\n}']
  ]) {
    check(`${opener.replace(/const |function /, '')} does not drift`,
      declarationOf(html, opener, closer) === declarationOf(designer, opener, closer));
  }
}

console.log('a band can be a strip of KPI cards (L4)');
{
  const assets = {
    role: 'standalone', alias: 'b7', name: 'Other Financial Information',
    columns: [{ alias: 'metric', label: 'Metric' }, { alias: 'amount', label: 'Amount' }],
    rows: [
      { cells: { metric: { text: 'Plant & Machinery (QAR)' }, amount: { value: 2290000, text: '2,290,000.00' } } },
      { cells: { metric: { text: 'Valuation Date' }, amount: { value: null, text: 'Apr 2026' } } }
    ],
    rowCount: 2, truncated: false, elapsedMs: 2
  };
  const cards = api.datasetBlock(assets, null, () => '', null, { displayAs: 'cards', icon: 'coin' });
  check('a card per row', (cards.match(/stat-card"/g) || []).length === 2, cards.slice(0, 200));
  check('the authored value text is the stat', cards.includes('2,290,000.00'));
  check('a non-numeric stat is a perfectly good card', cards.includes('Apr 2026'));
  check('the band icon rides every card', (cards.match(/band-icon/g) || []).length >= 2);

  // No icon chosen: no tinted square pretending to be one.
  const plainCards = api.datasetBlock(assets, null, () => '', null, { displayAs: 'cards' });
  check('no icon means no icon box at all', !plainCards.includes('stat-icon'), plainCards.slice(0, 160));
}

console.log('a badge column wears its value as a pill (L4)');
{
  const statuses = {
    role: 'root', name: 'Loans',
    columns: [{ alias: 'qdb_name', label: 'Ref' }, { alias: 'statuscode', label: 'Status' }],
    rows: [{ cells: { qdb_name: { text: 'LN-1' }, statuscode: { value: 1, text: 'Under RM Study' } } }],
    rowCount: 1, truncated: false, elapsedMs: 1
  };
  const badged = api.datasetBody(statuses, null, () => '', null, new Set(['statuscode']));
  check('the marked column renders the pill', badged.includes('cell-badge') && badged.includes('Under RM Study'), badged.slice(0, 300));
  check('the unmarked column stays plain', !/cell-badge[^>]*>LN-1/.test(badged));
  const plain = api.datasetBody(statuses, null, () => '', null, undefined);
  check('no badge set means no pills anywhere', !plain.includes('cell-badge'));
}

console.log('an option set wearing a number is not a number (the lineage-demo defect)');
{
  const rows = [
    { cells: { statuscode: { value: 1, text: 'Under RM Study' } } },
    { cells: { statuscode: { value: 1, text: 'Under RM Study' } } },
    { cells: { amount: { value: 1250.5, text: 'QAR 1,250.50' } } }
  ];
  check('a numeric code with a worded label is a choice', api.inferColumnType('statuscode', rows) === 'Option set');
  check('a genuine number with formatted text stays numeric', api.inferColumnType('amount', rows) === 'Decimal');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
