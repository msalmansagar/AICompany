import { fileURLToPath } from 'node:url';
const DESIGNER = fileURLToPath(new URL('../prototype/report-designer.html', import.meta.url));
// The wizard's live preview, and the step/layout glyphs beside it.
//
// The defect this suite was written for: the wizard is a body-level overlay and render() rebuilds
// only #content, so preview rows arriving for a query started inside the wizard repainted nothing.
// The "Reading account from Dataverse…" skeleton stayed on screen for the life of the step, which
// reads as a query that never returns. The rows were there; nothing put them on screen.
//
// The icon checks exist because a mistyped glyph name is silent — ic() returns an empty <svg> and
// the card renders with a blank badge rather than throwing. That is the same shape of failure as a
// transformation type the engine does not implement, and it is caught the same way: by asserting
// the name resolves to a path, not by looking at it.
import { readFileSync } from 'node:fs';
import { liftDeclaration } from './engine-harness.mjs';

const source = readFileSync(DESIGNER, 'utf8');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : '  ' + detail}`);
  ok ? passed++ : failed++;
};

/** Builds named declarations out of the shipped designer, with stubs for what they reach for. */
function build(names, stubs) {
  const body = names.map(n => liftDeclaration(source, n)).join('\n');
  return new Function(...Object.keys(stubs),
    `${body}; return { ${names.join(', ')} };`)(...Object.values(stubs));
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ============================ rows arriving must reach the screen ============================ */

console.log('preview rows arriving while the wizard is open');

const previewData = { byKey: {}, pending: {}, errorByKey: {} };
const calls = { render: 0, repaint: 0 };

const preview = build(
  ['previewRows', 'previewKey', 'loadPreviewRows', 'previewFetchXml', 'previewIsLoading', 'previewPlaceholder'],
  {
    previewData,
    PREVIEW_ROW_LIMIT: 10,
    esc,
    dvList: async () => [{ name: 'Fabrikam' }, { name: 'Contoso' }],
    toPreviewRow: (row, cols) => Object.fromEntries(cols.map(c => [c.key, row[c.key]])),
    beginBusy: () => {}, endBusy: () => {},
    toast: () => {},
    loadingNote: text => `<div class="loading">${text}</div>`,
    skeletonRows: () => '<div class="skel"></div>',
    render: () => calls.render++,
    repaintWizardPreviews: () => calls.repaint++
  });

const cols = [{ key: 'name', name: 'Account Name', type: 'Text' }];

const firstPass = preview.previewRows(cols, 'account');
check('the first render gets no rows and starts the query', firstPass.length === 0);
check('and says it is loading', preview.previewIsLoading(cols, 'account') === true);
check('so the placeholder names the table being read',
  preview.previewPlaceholder(cols, 'account').includes('Reading account from Dataverse'));

await new Promise(resolve => setTimeout(resolve, 0));

check('the rows land', preview.previewRows(cols, 'account').length === 2);
check('and it stops claiming to be loading', preview.previewIsLoading(cols, 'account') === false);
check('the app shell is re-rendered', calls.render === 1, `got ${calls.render}`);
// The defect: this was the missing call. render() alone leaves the overlay untouched.
check('AND the open wizard is repainted', calls.repaint === 1, `got ${calls.repaint}`);

console.log('\nthe placeholder distinguishes loading from empty');
previewData.byKey['account|name'] = [];
check('an empty result is not reported as still loading',
  preview.previewIsLoading(cols, 'account') === false);
check('and says the query returned nothing rather than showing a skeleton',
  preview.previewPlaceholder(cols, 'account').includes('No rows returned'));
check('no entity at all asks for one',
  preview.previewPlaceholder([], '').includes('Pick a main entity'));

/* ============================ the repaint itself ============================ */

console.log('\nrepaintWizardPreviews');

function repaintHarness(wiz, presentHostIds) {
  const repainted = [];
  const api = build(['repaintWizardPreviews'], {
    wiz,
    WIZARD_PREVIEW_HOSTS: ['wz_preview', 'wz_dpreview'],
    renderMiniPreview: (host, draft) => repainted.push({ host: host.id, draft }),
    document: { getElementById: id => presentHostIds.includes(id) ? { id } : null }
  });
  api.repaintWizardPreviews();
  return repainted;
}

const draft = { mainEntity: 'account', columns: ['name'] };

const onLayoutStep = repaintHarness({ step: 7, draft }, ['wz_preview']);
check('repaints the layout step preview', onLayoutStep.length === 1 && onLayoutStep[0].host === 'wz_preview',
  JSON.stringify(onLayoutStep.map(r => r.host)));
check('with the draft, so it renders what is being built', onLayoutStep[0].draft === draft);

const onDesignStep = repaintHarness({ step: 8, draft }, ['wz_dpreview']);
check('repaints the design step preview too',
  onDesignStep.length === 1 && onDesignStep[0].host === 'wz_dpreview');

check('repaints nothing when the wizard is closed',
  repaintHarness({ step: 7, draft }, []).length === 0);
check('and nothing when there is no draft to render',
  repaintHarness({ step: 0, draft: null }, ['wz_preview']).length === 0);

/* ============================ glyphs ============================ */

console.log('\nwizard step icons');

const { ic } = build(['ic'], {});
const hasPath = name => /<(path|rect|circle|ellipse)/.test(ic(name));

const { WIZ_STEPS } = build(['WIZ_STEPS'], {});
check('every step declares an icon', WIZ_STEPS.every(s => !!s.icon),
  WIZ_STEPS.filter(s => !s.icon).map(s => s.key).join(', '));
const unknownStepIcons = WIZ_STEPS.filter(s => !hasPath(s.icon));
check('and every one of them resolves to a drawn glyph', unknownStepIcons.length === 0,
  unknownStepIcons.map(s => `${s.key}→${s.icon}`).join(', '));

const wiz = { step: 3 };
const { wizardRailStep } = build(['wizardRailStep'], { wiz, ic, esc });

const current = wizardRailStep(WIZ_STEPS[3], 3);
check('the current step is marked active', current.includes('wiz-step active'));
check('and shows its glyph', current.includes('<svg'));
check('and keeps its number, because eleven steps need one', current.includes('>4.</span>'));

const done = wizardRailStep(WIZ_STEPS[0], 0);
check('a completed step is marked done', done.includes('done'));
check('and shows a tick instead of its glyph', done.includes('✓') && !done.includes('<svg'));

console.log('\nlayout icons');

const { LAYOUT_CATALOG } = build(['LAYOUT_CATALOG'], {});
check('every layout declares an icon', LAYOUT_CATALOG.every(l => !!l.icon),
  LAYOUT_CATALOG.filter(l => !l.icon).map(l => l.type).join(', '));

const unknownLayoutIcons = LAYOUT_CATALOG.filter(l => !hasPath(l.icon));
check('and every one resolves to a drawn glyph', unknownLayoutIcons.length === 0,
  unknownLayoutIcons.map(l => `${l.type}→${l.icon}`).join(', '));

// Twenty-seven cards copy-pasted from each other is exactly how two layouts end up wearing the
// same picture, which makes the picture worse than none.
const iconNames = LAYOUT_CATALOG.map(l => l.icon);
const duplicated = iconNames.filter((n, i) => iconNames.indexOf(n) !== i);
check('no two layouts share a glyph', duplicated.length === 0, [...new Set(duplicated)].join(', '));

const { REPORT_SHAPES } = build(['REPORT_SHAPES'], {
  columnsForTable: () => [], columnsForGrouping: () => []
});
const { layoutChoiceCard } = build(['layoutChoiceCard'], { ic, esc, REPORT_SHAPES });
const tabular = LAYOUT_CATALOG[0];
const selected = layoutChoiceCard(tabular, { shape: '', layoutType: tabular.type });
check('the chosen layout card is marked selected', selected.includes('choice-card sel'));
check('the card carries its icon badge', selected.includes('cc-ic') && selected.includes('<svg'));
check('and still names the layout', selected.includes(esc(tabular.type)));
check('an unchosen card is not marked selected',
  !layoutChoiceCard(tabular, { shape: '', layoutType: 'Book Layout' }).includes('sel"'));

console.log('\nthe preview label');
const { previewLabelHtml } = build(['previewLabelHtml'], { ic, esc });
const label = previewLabelHtml(LAYOUT_CATALOG[6]);
check('names the layout being previewed', label.includes('Chart Report'));
check('shows its glyph', label.includes('<svg'));
// It said "sample data" for months after the preview started reading the org.
check('and does not call real rows sample data', !/sample data/i.test(label));
check('the wizard step no longer promises sample data either',
  !/renders your chosen entity and columns with sample data/.test(source));

/* ============================ head start vs. layout ============================ */

// Step 1 and step 8 both appear to ask "what shape is this report?". They are different questions:
// step 1 seeds a layout, exports AND a column-picking rule (which step 8 cannot do, because it runs
// before any table is chosen); step 8 is the decision, over all 27, with a preview attached.

console.log('\nthe head start states what it will do');

const { exportsForLayout } = build(['VISUAL_LAYOUTS', 'AGGREGATE_LAYOUTS', 'exportsForLayout'], {});

check('every head start names the columns it will suggest',
  Object.values(REPORT_SHAPES).every(s => !!s.suggests),
  Object.entries(REPORT_SHAPES).filter(([, s]) => !s.suggests).map(([k]) => k).join(', '));
// A shape owning its own export list is what let a Chart's PDF+PNG outlive the Chart.
check('and no head start carries its own export list',
  Object.values(REPORT_SHAPES).every(s => !s.exports));
check('every head start names a real layout',
  Object.values(REPORT_SHAPES).every(s => LAYOUT_CATALOG.some(l => l.type === s.layoutType)));

const { shapeConsequence } = build(['shapeConsequence'], { exportsForLayout });
const consequence = shapeConsequence(REPORT_SHAPES.tabular);
check('the card states the layout it brings', consequence.includes('Tabular Report'));
check('what columns it will suggest', consequence.includes(REPORT_SHAPES.tabular.suggests));
check('and the exports that come with it', consequence.includes('PDF, Excel, CSV'), consequence);

console.log('\nexports follow the layout until the author takes them over');

check('a row layout offers the row formats',
  exportsForLayout('Tabular Report').join() === 'PDF,Excel,CSV');
check('a drawn layout offers an image instead',
  exportsForLayout('Chart Report').join() === 'PDF,Image (PNG)');
check('an aggregate layout offers neither CSV nor an image',
  exportsForLayout('Summary Report').join() === 'PDF,Excel');
check('an unlisted layout falls back to the row formats',
  exportsForLayout('Certificate Layout').join() === 'PDF,Excel,CSV');

// The defect: start from Chart, switch to Tabular on the layout step, and you were left with a
// table exportable to neither Excel nor CSV, silently, because nothing connected the two.
const { applyShape } = build(['applyShape'], { REPORT_SHAPES, exportsForLayout });
const chartDraft = { shape: '', layoutType: '', exports: [] };
applyShape(chartDraft, 'chart');
check('starting from Chart sets the image exports',
  chartDraft.exports.join() === 'PDF,Image (PNG)', chartDraft.exports.join());

/** What the layout-step click handler does to a draft when a new layout is chosen. */
const switchLayout = (draft, layoutType) => {
  const next = { ...draft, layoutType };
  if (!next._exportsTouched) next.exports = exportsForLayout(layoutType);
  return next;
};

check('switching to Tabular brings Excel and CSV back',
  switchLayout(chartDraft, 'Tabular Report').exports.join() === 'PDF,Excel,CSV',
  switchLayout(chartDraft, 'Tabular Report').exports.join());
check('a list the author has edited is never overwritten',
  switchLayout({ ...chartDraft, _exportsTouched: true, exports: ['PDF'] }, 'Tabular Report')
    .exports.join() === 'PDF');

const { exportsLabelHtml } = build(['exportsLabelHtml'], {});
check('the label says the layout owns the list', exportsLabelHtml({}).includes('follow the layout'));
check('and says the author owns it once touched',
  exportsLabelHtml({ _exportsTouched: true }).includes('yours'));

console.log('\nthe layout step credits the head start');

const startedFromChart = { shape: 'chart', layoutType: 'Chart Report' };
const chartLayout = LAYOUT_CATALOG.find(l => l.type === 'Chart Report');
check('the card the head start chose says so',
  layoutChoiceCard(chartLayout, startedFromChart).includes('head start'));
check('another card claims no such thing',
  !layoutChoiceCard(LAYOUT_CATALOG[0], startedFromChart).includes('head start'));
check('and a blank start credits nothing at all',
  !layoutChoiceCard(chartLayout, { shape: '', layoutType: 'Chart Report' }).includes('head start'));

/* ============================ the preview is on screen ============================ */

// Stacked under twenty-seven cards, the preview was below the fold on arrival — so choosing a
// layout looked like it did nothing until you scrolled down to check.

console.log('\nboth preview steps put the preview beside their picker, not beneath it');

const twoColumnStep = source.slice(source.indexOf('function wizLayout'),
  source.indexOf('function wizDesign'));
check('the layout step is a two-column layout-step grid', twoColumnStep.includes('class="layout-step"'));
check('with the cards in the scrolling column', twoColumnStep.includes('class="layout-pick"'));
check('and the preview in the pinned one', /class="layout-preview"[\s\S]*?id="wz_preview"/.test(twoColumnStep));

const designStep = source.slice(source.indexOf('function wizDesign'), source.indexOf('function wizETL'));
check('the design step does the same', designStep.includes('class="layout-step"'));
check('with its own preview pinned', /class="layout-preview"[\s\S]*?id="wz_dpreview"/.test(designStep));

check('the preview column is sticky, so it survives scrolling the picker',
  /\.layout-step \.layout-preview \{[^}]*position: sticky/.test(source));
check('and scrolls internally rather than running off the bottom',
  /\.layout-step \.layout-preview \{[^}]*overflow: auto/.test(source));
// One column on a narrow window, or the preview would be a sliver.
check('it stacks again below 1040px',
  /@media \(max-width: 1040px\)[\s\S]{0,220}\.layout-step \{ grid-template-columns: 1fr/.test(source));
check('and stops being sticky when stacked',
  /@media \(max-width: 1040px\)[\s\S]{0,320}position: static/.test(source));

console.log('\nthe two steps no longer ask the same question');
check('step 1 says it is not the layout decision',
  /It is not the layout decision/.test(source));
check('and points at the step that is',
  /step 8 offers all \$\{LAYOUT_CATALOG\.length\} layouts/.test(source));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
