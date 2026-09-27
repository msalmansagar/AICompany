/**
 * Reads an SSRS .rdl and reports what this engine can take from it — and, with --emit, writes the
 * report definition for the parts that convert.
 *
 * The point of this tool is the part most migration tools get wrong. Converting the easy 70% is
 * simple; the value is in naming the other 30% loudly, per report, BEFORE anyone commits to a
 * date. A converter that silently drops a page footer, a VB expression or a 20,000-row dataset
 * produces a report that looks migrated and is not — which is far more expensive than one that
 * refuses.
 *
 * So nothing is guessed. Anything without a faithful equivalent is reported as a BLOCKER or a
 * MANUAL step against the construct that caused it, and the summary tells you whether the report
 * is automatic, assisted, or a rewrite.
 *
 * Usage:
 *   node rdl-migrate.mjs <file.rdl|directory> [--emit <outdir>] [--json]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { sqlToFetchXml } from './sql-to-fetchxml.mjs';

/* ---------------- a small XML reader ----------------
   RDL is deep but regular, and only a handful of constructs matter here. Rather than take a
   dependency for a migration aid that runs a handful of times, this walks the tags it needs.
   It is deliberately not a general XML parser and will say so if it meets something it cannot
   read, instead of quietly returning nothing. */

/** All immediate-ish occurrences of <tag ...>…</tag>, with attributes and inner text. */
function elements(xml, tag) {
  const out = [];
  const open = new RegExp(`<${tag}(\\s[^>]*?)?(/)?>`, 'g');
  let match;
  while ((match = open.exec(xml)) !== null) {
    const attrs = attributes(match[1] || '');
    if (match[2]) { out.push({ attrs, inner: '' }); continue; }      // self-closing
    const from = open.lastIndex;
    let depth = 1, cursor = from;
    const scan = new RegExp(`<(/)?${tag}(\\s[^>]*?)?(/)?>`, 'g');
    scan.lastIndex = from;
    let step;
    while (depth > 0 && (step = scan.exec(xml)) !== null) {
      if (step[3]) continue;                                         // self-closing, no depth change
      depth += step[1] ? -1 : 1;
      cursor = step.index;
    }
    out.push({ attrs, inner: xml.slice(from, cursor) });
    open.lastIndex = cursor;
  }
  return out;
}

function attributes(text) {
  const attrs = {};
  for (const m of text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
  return attrs;
}

const firstText = (xml, tag) => {
  const found = elements(xml, tag)[0];
  return found ? decodeXml(found.inner.trim()) : null;
};

const decodeXml = s => String(s ?? '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&');

/* ---------------- what this engine can and cannot take ---------------- */

const ENGINE_MAX_ROWS = 5000;

/** RDL constructs with no faithful equivalent, and what to do instead. */
const UNSUPPORTED = [
  { tag: 'Subreport', severity: 'MANUAL',
    why: 'RDL subreports embed another full report per row. The engine has sub-reports but drives them from its own drilldown model, not from a row-bound RDL reference.',
    instead: 'Rebuild as a drilldown, or as a second report reached from the first.' },
  { tag: 'Code', severity: 'BLOCKER',
    why: 'Custom VB.NET in the report. The engine evaluates a sandboxed expression language and deliberately cannot execute arbitrary code.',
    instead: 'Move the logic into the query, a computed column, or the plugin.' },
  { tag: 'CodeModules', severity: 'BLOCKER',
    why: 'A custom .NET assembly is referenced. Nothing equivalent exists, by design.',
    instead: 'Reimplement server-side.' },
  { tag: 'Chart', severity: 'MANUAL',
    why: 'RDL charts carry their own series/axis model.',
    instead: 'Recreate with the engine’s chart layout; check the chart type exists first.' },
  { tag: 'Map', severity: 'BLOCKER', why: 'No mapping surface exists.', instead: 'Out of scope.' },
  { tag: 'Gauge', severity: 'MANUAL', why: 'No gauge visual.', instead: 'Closest is a KPI tile in a dashboard.' },
  { tag: 'Image', severity: 'MANUAL',
    why: 'Embedded or database images are not carried by the report definition.',
    instead: 'Re-add in the layout, or drop if decorative.' },
  { tag: 'PageBreak', severity: 'MANUAL',
    why: 'The engine renders a scrolling document, not paginated output.',
    instead: 'Ignore for screen; matters only if the PDF must paginate identically.' }
];

/** Expression fragments that cannot survive translation, with the reason. */
const EXPRESSION_TRAPS = [
  { pattern: /Globals!\s*(PageNumber|TotalPages)/i, severity: 'MANUAL',
    why: 'Page numbers assume paginated rendering; the engine renders one continuous document.' },
  { pattern: /\bRowNumber\s*\(/i, severity: 'MANUAL', why: 'RowNumber() has no equivalent.' },
  { pattern: /\bRunningValue\s*\(/i, severity: 'MANUAL', why: 'Running totals are not supported.' },
  { pattern: /\bLookup(Set)?\s*\(/i, severity: 'BLOCKER',
    why: 'Lookup across datasets. The engine executes one query per report; cross-dataset lookup has no equivalent.' },
  { pattern: /\bCode\./i, severity: 'BLOCKER', why: 'Calls custom VB code.' },
  { pattern: /\bIIf\s*\(/i, severity: 'AUTO-ISH',
    why: 'IIf maps to a conditional expression, but the syntax differs and must be re-checked.' },
  { pattern: /\bFirst\s*\(|\bLast\s*\(/i, severity: 'MANUAL', why: 'Positional aggregates are not supported.' }
];

/**
 * Grades how hard a SQL dataset is to re-express as FetchXML.
 *
 * On a standalone report server every dataset is SQL, so calling them all BLOCKER says nothing
 * useful — the whole estate comes back red and the estimate is no better than a guess. What is
 * worth knowing is which ones are an afternoon and which ones cannot be expressed in FetchXML at
 * all, because FetchXML is a query language over one entity graph, not a relational one: it has no
 * subqueries, no UNION, no window functions and no arbitrary expressions.
 */
function gradeSqlRewrite(sql) {
  const text = String(sql).replace(/\s+/g, ' ');
  const has = pattern => pattern.test(text);

  const readsBaseTables = has(/\bfrom\s+(dbo\.)?(?!Filtered)\w+/i) && !has(/\bfrom\s+Filtered/i);

  // Things FetchXML simply cannot express.
  const impossible = [
    [/\bunion\b/i, 'UNION — FetchXML returns one entity graph, not a union of result sets'],
    [/\bwith\s+\w+\s+as\s*\(/i, 'a CTE'],
    [/\bover\s*\(/i, 'a window function'],
    [/\bpivot\b|\bunpivot\b/i, 'PIVOT'],
    [/\binto\s+#/i, 'a temp table'],
    [/\bexec\b|\bsp_\w+/i, 'a stored procedure'],
    [/\(\s*select\b/i, 'a subquery in the select or where']
  ].filter(([p]) => has(p)).map(([, label]) => label);

  if (impossible.length) {
    return {
      grade: 'NOT POSSIBLE', severity: 'BLOCKER', readsBaseTables,
      why: `The query uses ${impossible.join(', ')}. FetchXML has no equivalent, so this cannot be re-expressed as a single engine query.`,
      instead: 'Keep in SSRS, or pre-compute the result — a view, a rollup field, or a scheduled job writing to an entity the report can then read simply.'
    };
  }

  const joins = (text.match(/\bjoin\b/gi) || []).length;
  const aggregates = has(/\b(group\s+by|sum\s*\(|count\s*\(|avg\s*\(|min\s*\(|max\s*\()/i);
  const computed = has(/\b(datediff|dateadd|case\s+when|convert\s*\(|cast\s*\(|isnull\s*\()/i);

  if (!joins && !aggregates && !computed) {
    return {
      grade: 'EASY', severity: 'MANUAL', readsBaseTables,
      why: 'One table with a filter. This is a direct translation into FetchXML, or a saved view.',
      instead: 'Rewrite as FetchXML — attributes, order, filter. Roughly an hour including reconciliation.'
    };
  }
  if (joins <= 3 && !computed) {
    return {
      grade: 'MODERATE', severity: 'MANUAL', readsBaseTables,
      why: `${joins} join(s)${aggregates ? ' and aggregation' : ''}. FetchXML expresses joins as link-entity and supports aggregate queries, so this translates — but the shape of the result changes and needs checking.`,
      instead: 'Rewrite with link-entity; for aggregates confirm the engine returns them in the form the layout expects.'
    };
  }
  return {
    grade: 'HARD', severity: 'MANUAL', readsBaseTables,
    why: `${joins} join(s)${aggregates ? ', aggregation' : ''}${computed ? ', and computed expressions (CASE/DATEDIFF/CAST)' : ''}. FetchXML cannot compute, so anything derived has to move to a computed column, a rollup, or the query it reads from.`,
    instead: 'Rewrite the joins as link-entity and move each computed expression to a computed column — or pre-compute upstream. Estimate generously and reconcile totals.'
  };
}

/** SSRS format strings that the engine expresses as a column type plus a transformation. */
function mapFormat(format) {
  if (!format) return null;
  if (/^C\d*$/i.test(format)) return { type: 'Currency', transform: 'CurrencyFormat' };
  if (/^[PN]\d*$/i.test(format)) return { type: 'Decimal', transform: 'NumberFormat' };
  if (/^[dDfFgGtTyYmM]$/.test(format) || /[dMy]{2,}/.test(format)) return { type: 'Date/Time', transform: 'DateFormat' };
  return { type: 'Text', transform: null };
}

/* ---------------- reading the report ---------------- */

function readRdl(xml, name) {
  const findings = [];
  const note = (severity, construct, why, instead) => findings.push({ severity, construct, why, instead });

  const datasets = elements(xml, 'DataSet').map(ds => {
    const query = elements(ds.inner, 'Query')[0];
    const command = query ? firstText(query.inner, 'CommandText') : null;
    const isFetch = !!command && /<\s*fetch[\s>]/i.test(command);
    return {
      name: ds.attrs.Name,
      command,
      isFetch,
      fields: elements(ds.inner, 'Field').map(f => ({
        name: f.attrs.Name,
        dataField: firstText(f.inner, 'DataField'),
        type: (firstText(f.inner, 'rd:TypeName') || '').replace('System.', '')
      }))
    };
  });

  const parameters = elements(xml, 'ReportParameter').map(p => ({
    name: p.attrs.Name,
    dataType: firstText(p.inner, 'DataType'),
    prompt: firstText(p.inner, 'Prompt'),
    nullable: firstText(p.inner, 'Nullable') === 'true'
  }));

  // Columns come from the header row's literal text paired with the detail row's field bindings.
  const tablix = elements(xml, 'Tablix')[0];
  const columns = [];
  let groupBy = null, hasTotals = false;

  if (tablix) {
    const rows = elements(tablix.inner, 'TablixRow');
    const cellsOf = row => elements(row.inner, 'TablixCell')
      .map(c => {
        const box = elements(c.inner, 'Textbox')[0];
        const value = box ? firstText(box.inner, 'Value') : null;
        const format = box ? firstText(box.inner, 'Format') : null;
        return { value: value || '', format };
      });

    const headerCells = rows[0] ? cellsOf(rows[0]) : [];
    const detailRow = rows.find(r => /=\s*Fields!/.test(r.inner) && !/=\s*(Sum|Avg|Count|Min|Max)\s*\(/i.test(r.inner));
    const detailCells = detailRow ? cellsOf(detailRow) : [];
    hasTotals = rows.some(r => /=\s*(Sum|Avg|Count|Min|Max)\s*\(/i.test(r.inner));

    detailCells.forEach((cell, index) => {
      const bound = /=\s*Fields!\s*([\w.]+)\s*\.Value/.exec(cell.value);
      if (!bound) return;
      const mapped = mapFormat(cell.format);
      columns.push({
        label: (headerCells[index] && headerCells[index].value) || bound[1],
        field: bound[1],
        type: mapped ? mapped.type : 'Text',
        transform: mapped ? mapped.transform : null
      });
    });

    const groupExpr = firstText(tablix.inner, 'GroupExpression');
    const grouped = groupExpr && /=\s*Fields!\s*([\w.]+)\s*\.Value/.exec(groupExpr);
    if (grouped) groupBy = grouped[1];
  }

  /* ---- what cannot come across ---- */

  for (const rule of UNSUPPORTED) {
    const count = elements(xml, rule.tag).length;
    if (count) note(rule.severity, `${rule.tag}${count > 1 ? ` ×${count}` : ''}`, rule.why, rule.instead);
  }

  const expressions = [...xml.matchAll(/<Value>([^<]*=[^<]*)<\/Value>/g)].map(m => decodeXml(m[1]));
  const seen = new Set();
  for (const expression of expressions) {
    for (const trap of EXPRESSION_TRAPS) {
      if (!trap.pattern.test(expression)) continue;
      const key = trap.why;
      if (seen.has(key)) continue;
      seen.add(key);
      note(trap.severity, `expression: ${expression.trim().slice(0, 54)}`, trap.why,
        'Rewrite as a computed column, or drop.');
    }
  }

  const sql = datasets.filter(d => d.command && !d.isFetch);
  for (const ds of sql) {
    const graded = gradeSqlRewrite(ds.command);
    note(graded.severity, `dataset "${ds.name}" is SQL — rewrite is ${graded.grade}`,
      graded.why, graded.instead);
    if (graded.readsBaseTables) {
      note('SECURITY', `dataset "${ds.name}" reads base tables, not Filtered* views`,
        'A report on base tables returns every row regardless of who ran it. Filtered views are what apply CRM row-level security, so this report may be showing data the same user could not see inside CRM today.',
        'Confirm who this report is exposed to before migrating. In the engine the equivalent query WILL be security-trimmed, so the migrated report may legitimately return fewer rows — verify that is a fix and not a regression.');
    }
  }
  if (datasets.length > 1) {
    note('MANUAL', `${datasets.length} datasets`,
      'A report definition here executes one primary query. Several datasets means several queries joined at render time.',
      'Combine with link-entity, or split into separate reports.');
  }
  if (!datasets.length) note('BLOCKER', 'no dataset', 'Nothing to read.', 'Check the file is a complete RDL.');
  if (!columns.length) note('MANUAL', 'no detail row found',
    'No row binds =Fields!x.Value, so the columns could not be read — often a matrix, a list, or free-form textboxes rather than a table.',
    'Rebuild the layout by hand.');

  // Row volume is the constraint people meet last and mind most. See c6-scale-characterisation.md.
  const top = /(?:<\s*fetch[^>]*\btop\s*=\s*"(\d+)")/i.exec(datasets.map(d => d.command || '').join(' '));
  if (top && Number(top[1]) > ENGINE_MAX_ROWS) {
    note('BLOCKER', `fetch top="${top[1]}"`,
      `The engine reads one page and caps at ${ENGINE_MAX_ROWS} rows. A report written to return more will be silently short.`,
      'Filter it down, or keep this one in SSRS until paging exists.');
  }

  return { name, datasets, parameters, columns, groupBy, hasTotals, findings };
}

/* ---------------- the definition this engine would need ---------------- */

function toReportDefinition(report) {
  const primary = report.datasets.find(d => d.isFetch) || report.datasets[0];

  /* A standalone report server has no FetchXML, so the query is translated here rather than left as
     SQL the engine cannot run. A refusal is carried into the definition instead of being dropped:
     an emitted definition holding SQL would import cleanly and fail at the first run. */
  let query = primary ? primary.command : null;
  let translation = null;
  if (primary && !primary.isFetch && primary.command) {
    translation = sqlToFetchXml(primary.command);
    query = translation.ok ? translation.fetchXml : null;
  }

  const entity = query
    ? (/<\s*entity\s+name\s*=\s*"([^"]+)"/i.exec(query) || [])[1] || null
    : (translation && translation.entity) || null;

  return {
    name: report.name,
    mainEntityLogicalName: entity,
    // Left at the engine's real ceiling rather than SSRS's, because a larger number is not applied.
    rowLimit: ENGINE_MAX_ROWS,
    translatedFromSql: !!translation,
    // Named so nothing can be loaded by accident while still holding an untranslatable query.
    needsQueryByHand: !!(translation && !translation.ok),
    queryNotes: translation ? translation.problems : [],
    dataSources: query ? [{
      name: 'Primary', type: 'FetchXML', primary: true, executionOrder: 1, query
    }] : [],
    columns: report.columns.map((c, index) => ({
      name: c.label, attribute: c.field, type: c.type,
      sequence: index + 1, visible: true, masked: false
    })),
    parameters: report.parameters.map((p, index) => ({
      parameterName: p.name,
      label: p.prompt || p.name,
      dataType: p.dataType,
      isRequired: !p.nullable,
      displayOrder: index + 1
    })),
    transformations: report.columns.filter(c => c.transform).map((c, index) => ({
      transformType: c.transform, stepOrder: index + 1, enabled: true,
      configJson: JSON.stringify({ columns: [c.field] })
    })),
    layout: {
      type: report.groupBy ? 'Grouped Report' : 'Tabular Report',
      groupBy: report.groupBy || null,
      grandTotal: report.hasTotals
    }
  };
}

/* ---------------- reporting ---------------- */

const RANK = { BLOCKER: 0, SECURITY: 1, MANUAL: 2, 'AUTO-ISH': 3 };

function verdictOf(findings) {
  if (findings.some(f => f.severity === 'BLOCKER')) return 'REWRITE — cannot be converted as it stands';
  if (findings.some(f => f.severity === 'MANUAL')) return 'ASSISTED — converts, with work listed below';
  return 'AUTOMATIC — converts as it stands';
}

function describe(report) {
  const lines = [];
  lines.push(`\n${'='.repeat(78)}\n${report.name}\n${'='.repeat(78)}`);
  lines.push(`verdict : ${verdictOf(report.findings)}`);
  const primary = report.datasets.find(d => d.isFetch) || report.datasets[0];
  lines.push(`query   : ${primary ? (primary.isFetch ? 'FetchXML' : 'NOT FetchXML') : 'none'}`);
  lines.push(`columns : ${report.columns.length}   parameters: ${report.parameters.length}` +
    `   grouped by: ${report.groupBy || '—'}   totals: ${report.hasTotals ? 'yes' : 'no'}`);

  if (report.columns.length) {
    lines.push('\ncolumns read from the tablix:');
    for (const c of report.columns) {
      lines.push(`  ${String(c.label).padEnd(24)} <- ${String(c.field).padEnd(20)} ${c.type}` +
        (c.transform ? `  (+${c.transform})` : ''));
    }
  }
  if (report.parameters.length) {
    lines.push('\nparameters:');
    for (const p of report.parameters) lines.push(`  ${String(p.name).padEnd(20)} ${String(p.dataType).padEnd(10)} "${p.prompt || ''}"`);
  }

  if (report.findings.length) {
    lines.push('\nwhat does not come across:');
    for (const f of [...report.findings].sort((a, b) => RANK[a.severity] - RANK[b.severity])) {
      lines.push(`  [${f.severity}] ${f.construct}`);
      lines.push(`      ${f.why}`);
      lines.push(`      → ${f.instead}`);
    }
  } else {
    lines.push('\nnothing found that does not come across.');
  }
  return lines.join('\n');
}

/* ---------------- entry ---------------- */

const target = process.argv[2];
if (!target) {
  console.log('Usage: node rdl-migrate.mjs <file.rdl|directory> [--emit <outdir>] [--json]');
  process.exit(1);
}
const emitAt = process.argv.includes('--emit') ? process.argv[process.argv.indexOf('--emit') + 1] : null;
const asJson = process.argv.includes('--json');

const files = statSync(target).isDirectory()
  ? readdirSync(target).filter(f => extname(f).toLowerCase() === '.rdl').map(f => join(target, f))
  : [target];

const reports = files.map(file => readRdl(readFileSync(file, 'utf8'), basename(file, extname(file))));

if (asJson) {
  console.log(JSON.stringify(reports.map(r => ({ ...r, definition: toReportDefinition(r) })), null, 2));
} else {
  for (const report of reports) console.log(describe(report));

  const tally = reports.reduce((acc, r) => {
    const v = verdictOf(r.findings).split(' ')[0];
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  console.log(`\n${'='.repeat(78)}\n${files.length} report(s): ` +
    Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', '));
  console.log('AUTOMATIC converts unattended. ASSISTED converts, then needs the listed work.');
  console.log('REWRITE cannot be converted as it stands and should be estimated as new build.');
}

if (emitAt) {
  mkdirSync(emitAt, { recursive: true });
  for (const report of reports) {
    const path = join(emitAt, `${report.name}.json`);
    writeFileSync(path, JSON.stringify(toReportDefinition(report), null, 2));
    console.log(`emitted ${path}`);
  }
}
