/**
 * Translates the SQL an SSRS dataset runs against CRM filtered views into FetchXML.
 *
 * This is the piece the whole migration turns on. On a standalone report server every dataset is
 * SQL, so without translation nothing converts; with it, the ordinary reports — a few tables, a
 * filter, a sort — convert unattended, and the effort concentrates on the ones that genuinely
 * cannot.
 *
 * It REFUSES rather than approximates. FetchXML is a query over one entity graph, not a relational
 * language: no subqueries, no UNION, no CTEs, no window functions, no computed columns. Where the
 * SQL asks for something FetchXML cannot express, this returns a refusal naming the construct
 * instead of emitting FetchXML that runs and answers a subtly different question — which is the
 * worst possible outcome for a report, because it looks migrated and reconciles wrong.
 *
 * Usage:  node sql-to-fetchxml.mjs "SELECT ..."
 */

/** Constructs with no FetchXML equivalent. Checked before anything else is attempted. */
const REFUSALS = [
  [/\bunion\b/i, 'UNION — FetchXML returns one entity graph, not a union of result sets'],
  [/\bwith\s+[\w[\]]+\s+as\s*\(/i, 'a common table expression'],
  [/\bover\s*\(/i, 'a window function'],
  [/\b(un)?pivot\b/i, 'PIVOT'],
  [/\binto\s+#?\w+/i, 'SELECT INTO'],
  [/\bexec(ute)?\b|\bsp_\w+/i, 'a stored procedure'],
  [/\bhaving\b/i, 'HAVING'],
  [/\bcross\s+apply\b|\bouter\s+apply\b/i, 'APPLY'],
  [/\bfull\s+(outer\s+)?join\b/i, 'a FULL OUTER JOIN — FetchXML links are inner or outer from the parent only'],
  [/\bright\s+(outer\s+)?join\b/i, 'a RIGHT JOIN — invert it to a LEFT JOIN and retry'],
  [/\(\s*select\b/i, 'a subquery — FetchXML cannot nest a query inside a condition']
];

const OPERATORS = [
  [/^<>|^!=/, 'ne'], [/^>=/, 'ge'], [/^<=/, 'le'], [/^=/, 'eq'], [/^>/, 'gt'], [/^</, 'lt']
];

/** FilteredAccount -> account. Filtered views carry the logical name after the prefix. */
const entityOf = table => String(table).replace(/^dbo\./i, '').replace(/^Filtered/i, '').toLowerCase();

const escapeXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Filtered views expose an option set twice: `statecode` (the value) and `statecodename` (the
 * label). FetchXML returns both from the one attribute, so a report selecting the label wants the
 * base attribute, not an attribute called statecodename that does not exist.
 */
function baseAttribute(column, known) {
  const lower = String(column).toLowerCase();
  if (lower.endsWith('name') && known.has(lower.slice(0, -4))) return lower.slice(0, -4);
  return lower;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0, current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && text.slice(current.length).length >= 0 && ch === separator) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * Splits a WHERE clause on top-level AND.
 *
 * BETWEEN x AND y contains an AND of its own, and splitting on it silently produces
 * "revenue BETWEEN 1000" — a condition that looks translatable and means something else. The first
 * AND after a BETWEEN therefore belongs to it, not to the clause.
 */
function splitConditions(where) {
  const parts = [];
  let depth = 0, current = '', i = 0, insideBetween = false;
  while (i < where.length) {
    const ch = where[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && /^\bbetween\b/i.test(where.slice(i))) insideBetween = true;

    const and = depth === 0 ? /^\s+and\s+/i.exec(where.slice(i)) : null;
    if (and) {
      if (insideBetween) { insideBetween = false; current += and[0]; i += and[0].length; continue; }
      parts.push(current);
      current = '';
      i += and[0].length;
      continue;
    }
    current += ch;
    i++;
  }
  parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
}

/** Removes parentheses that wrap the WHOLE expression. Stripping every trailing ")" turns
    "x IN (1,2,3)" into "x IN (1,2,3" — a condition that then fails to parse for a made-up reason. */
function unwrap(text) {
  let result = text.trim();
  while (result.startsWith('(') && result.endsWith(')')) {
    let depth = 0, wrapsAll = true;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === '(') depth++;
      else if (result[i] === ')') depth--;
      if (depth === 0 && i < result.length - 1) { wrapsAll = false; break; }
    }
    if (!wrapsAll) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function translateCondition(raw, resolve) {
  const text = unwrap(raw);

  const nul = /^([\w.]+)\s+is\s+(not\s+)?null$/i.exec(text);
  if (nul) return { column: nul[1], operator: nul[2] ? 'not-null' : 'null', values: [] };

  const between = /^([\w.]+)\s+between\s+(.+?)\s+and\s+(.+)$/i.exec(text);
  if (between) return { column: between[1], operator: 'between', values: [between[2], between[3]].map(clean) };

  const inList = /^([\w.]+)\s+(not\s+)?in\s*\((.+)\)$/i.exec(text);
  if (inList) {
    return { column: inList[1], operator: inList[2] ? 'not-in' : 'in',
      values: splitTopLevel(inList[3], ',').map(clean) };
  }

  const like = /^([\w.]+)\s+(not\s+)?like\s+(.+)$/i.exec(text);
  if (like) return { column: like[1], operator: like[2] ? 'not-like' : 'like', values: [clean(like[3])] };

  const compare = /^([\w.]+)\s*(<>|!=|>=|<=|=|>|<)\s*(.+)$/.exec(text);
  if (compare) {
    const operator = (OPERATORS.find(([p]) => p.test(compare[2])) || [])[1];
    if (!operator) return { unsupported: `operator ${compare[2]}` };
    const value = clean(compare[3]);
    // A function on the right is a moving target FetchXML cannot evaluate. Its date operators are
    // the intended equivalent, but which one is a judgement, so this asks rather than guesses.
    if (/\b(getdate|dateadd|datediff|convert|cast|isnull|coalesce)\s*\(/i.test(compare[3])) {
      return { unsupported: `the expression "${compare[3].trim()}" — FetchXML cannot compute. Its relative-date operators (today, last-x-days, this-month) are usually what was meant; pick one deliberately.` };
    }
    return { column: compare[1], operator, values: [value] };
  }
  return { unsupported: `condition "${text}"` };
}

const clean = value => String(value).trim().replace(/^N?'(.*)'$/s, '$1').replace(/''/g, "'");

export function sqlToFetchXml(sql) {
  const problems = [];
  const text = String(sql).replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();

  for (const [pattern, label] of REFUSALS) {
    if (pattern.test(text)) return { ok: false, problems: [`Cannot translate: the query uses ${label}.`] };
  }
  if (/\bor\b/i.test(text.replace(/'[^']*'/g, ''))) {
    problems.push('The WHERE clause contains OR. FetchXML nests filters explicitly, so this needs a filter type="or" placing by hand — the output below treats every condition as AND.');
  }
  if (/\b(group\s+by)\b/i.test(text)) {
    return { ok: false, problems: ['Cannot translate: GROUP BY. FetchXML aggregates are a different query shape (aggregate="true" with alias and aggregate attributes) — build it in the designer, or pre-compute.'] };
  }

  const shape = /^\s*select\s+(?:distinct\s+)?(?:top\s+\(?\d+\)?\s+)?(.+?)\s+from\s+(.+?)(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+(.+?))?\s*$/i.exec(text);
  if (!shape) return { ok: false, problems: ['Cannot read the statement as SELECT … FROM … [WHERE …] [ORDER BY …].'] };

  const [, selectList, fromClause, whereClause, orderClause] = shape;

  /* ---- FROM and JOINs ----
     Joins are matched whole rather than split on, because splitting before the word "join" tears
     "LEFT OUTER JOIN" in half and loses the join type. */
  const JOIN_CLAUSE = /\b((?:inner|left|right|full|cross)\s+(?:outer\s+)?join|join)\s+([\w.[\]]+)(?:\s+(?:as\s+)?(\w+))?\s+on\s+([\s\S]+?)(?=\s+\b(?:(?:inner|left|right|full|cross)\s+(?:outer\s+)?)?join\b|$)/gi;

  const firstJoin = fromClause.search(/\b(?:(?:inner|left|right|full|cross)\s+(?:outer\s+)?)?join\b/i);
  const baseText = (firstJoin >= 0 ? fromClause.slice(0, firstJoin) : fromClause).trim();
  const baseMatch = /^([\w.[\]]+)(?:\s+(?:as\s+)?(\w+))?$/i.exec(baseText);
  if (!baseMatch) return { ok: false, problems: [`Cannot read the FROM clause: "${baseText}"`] };

  const primary = { table: baseMatch[1], alias: (baseMatch[2] || baseMatch[1]).toLowerCase(), entity: entityOf(baseMatch[1]) };
  const aliases = { [primary.alias]: primary };

  const links = [];
  for (const join of fromClause.matchAll(JOIN_CLAUSE)) {
    const [, keyword, table, alias, onClause] = join;
    const on = /^\s*([\w.]+)\s*=\s*([\w.]+)\s*$/.exec(onClause.trim());
    if (!on) { problems.push(`Join condition "${onClause.trim().slice(0, 60)}" is not a simple key equality; FetchXML links on one pair of columns.`); continue; }

    const link = {
      entity: entityOf(table),
      alias: (alias || table).toLowerCase(),
      type: /left/i.test(keyword) ? 'outer' : 'inner',
      left: on[1], right: on[2], attributes: []
    };
    aliases[link.alias] = link;
    links.push(link);
  }

  /* ---- SELECT list, assigned to whichever table each column belongs to ---- */
  const selected = splitTopLevel(selectList, ',').map(part => {
    const withoutAlias = part.replace(/\s+(?:as\s+)?["'\[]?\w+["'\]]?$/i, '').trim();
    return withoutAlias || part.trim();
  });

  /* Every column named anywhere in the statement, so `statecodename` can be recognised as the label
     of `statecode` and collapsed onto it. Built from the WHERE and ORDER BY too, not only the
     SELECT — a report commonly shows the label and filters on the value, and reading the SELECT
     alone would miss that. The base must actually appear somewhere, which is what stops `fullname`
     being mangled into `full`. */
  const known = new Set();
  for (const reference of text.matchAll(/\b(?:(\w+)\.)?(\w+)\b/g)) known.add(reference[2].toLowerCase());

  const primaryAttributes = [];
  for (const column of selected) {
    if (column === '*') {
      problems.push('SELECT * — FetchXML needs the attributes named. List them explicitly.');
      continue;
    }
    if (/[()+]/.test(column)) {
      problems.push(`"${column}" is computed. FetchXML returns stored values only — move it to a computed column in the report.`);
      continue;
    }
    const qualified = /^(\w+)\.(\w+)$/.exec(column);
    const owner = qualified ? aliases[qualified[1].toLowerCase()] : primary;
    const attribute = baseAttribute(qualified ? qualified[2] : column, known);
    if (!owner) { problems.push(`"${column}" refers to an unknown alias.`); continue; }
    (owner === primary ? primaryAttributes : owner.attributes).push(attribute);
  }

  /* ---- WHERE ---- */
  const conditions = [];
  if (whereClause) {
    for (const raw of splitConditions(whereClause)) {
      const condition = translateCondition(raw, aliases);
      if (condition.unsupported) { problems.push(`Cannot translate ${condition.unsupported}`); continue; }
      const qualified = /^(\w+)\.(\w+)$/.exec(condition.column);
      const owner = qualified ? aliases[qualified[1].toLowerCase()] : primary;
      if (owner && owner !== primary) {
        problems.push(`Condition on "${condition.column}" filters a joined table; placed on the primary entity below — move it inside that link-entity if it must filter the join.`);
      }
      conditions.push({ ...condition, attribute: baseAttribute(qualified ? qualified[2] : condition.column, known) });
    }
  }

  /* ---- ORDER BY ---- */
  const orders = (orderClause ? splitTopLevel(orderClause, ',') : []).map(part => {
    const m = /^([\w.]+)(?:\s+(asc|desc))?$/i.exec(part.trim());
    if (!m) { problems.push(`Cannot read the sort "${part.trim()}".`); return null; }
    const qualified = /^(\w+)\.(\w+)$/.exec(m[1]);
    return { attribute: baseAttribute(qualified ? qualified[2] : m[1], known), descending: /desc/i.test(m[2] || '') };
  }).filter(Boolean);

  /* ---- emit ---- */
  const indent = (depth) => '  '.repeat(depth);
  const lines = ['<fetch version="1.0" mapping="logical">', `${indent(1)}<entity name="${primary.entity}">`];
  for (const attribute of [...new Set(primaryAttributes)]) lines.push(`${indent(2)}<attribute name="${attribute}" />`);
  for (const order of orders) lines.push(`${indent(2)}<order attribute="${order.attribute}"${order.descending ? ' descending="true"' : ''} />`);

  if (conditions.length) {
    lines.push(`${indent(2)}<filter type="and">`);
    for (const c of conditions) {
      if (!c.values.length) lines.push(`${indent(3)}<condition attribute="${c.attribute}" operator="${c.operator}" />`);
      else if (c.values.length === 1) lines.push(`${indent(3)}<condition attribute="${c.attribute}" operator="${c.operator}" value="${escapeXml(c.values[0])}" />`);
      else {
        lines.push(`${indent(3)}<condition attribute="${c.attribute}" operator="${c.operator}">`);
        for (const value of c.values) lines.push(`${indent(4)}<value>${escapeXml(value)}</value>`);
        lines.push(`${indent(3)}</condition>`);
      }
    }
    lines.push(`${indent(2)}</filter>`);
  }

  for (const link of links) {
    const from = link.right.includes('.') ? link.right.split('.')[1] : link.right;
    const to = link.left.includes('.') ? link.left.split('.')[1] : link.left;
    // from is the column on the linked entity, to is the column on the parent — the SQL may have
    // written the equality either way round, so it is resolved by which alias each side names.
    const leftAlias = link.left.split('.')[0].toLowerCase();
    const linkFrom = leftAlias === link.alias ? to : from;
    const linkTo = leftAlias === link.alias ? from : to;
    lines.push(`${indent(2)}<link-entity name="${link.entity}" from="${linkFrom}" to="${linkTo}" link-type="${link.type}" alias="${link.alias}">`);
    for (const attribute of [...new Set(link.attributes)]) lines.push(`${indent(3)}<attribute name="${attribute}" />`);
    lines.push(`${indent(2)}</link-entity>`);
  }

  lines.push(`${indent(1)}</entity>`, '</fetch>');
  return { ok: true, fetchXml: lines.join('\n'), entity: primary.entity, problems };
}

/* CLI */
if (process.argv[1] && process.argv[1].endsWith('sql-to-fetchxml.mjs')) {
  const sql = process.argv.slice(2).join(' ');
  if (!sql) { console.log('Usage: node sql-to-fetchxml.mjs "SELECT ..."'); process.exit(1); }
  const result = sqlToFetchXml(sql);
  if (result.ok) {
    console.log(result.fetchXml);
    if (result.problems.length) {
      console.log('\ncheck by hand:');
      for (const p of result.problems) console.log('  - ' + p);
    }
  } else {
    console.log('REFUSED');
    for (const p of result.problems) console.log('  ' + p);
    process.exit(2);
  }
}
