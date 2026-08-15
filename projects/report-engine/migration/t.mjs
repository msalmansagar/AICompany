import { sqlToFetchXml } from './sql-to-fetchxml.mjs';
const cases = [
  ['fullname must survive', 'SELECT fullname, emailaddress1 FROM FilteredContact'],
  ['IN list',               "SELECT name FROM FilteredAccount WHERE statuscode IN (1, 2, 3)"],
  ['IS NULL',               'SELECT name FROM FilteredAccount WHERE primarycontactid IS NULL'],
  ['BETWEEN',               "SELECT name FROM FilteredAccount WHERE revenue BETWEEN 1000 AND 5000"],
  ['refuses subquery',      'SELECT name FROM FilteredAccount WHERE accountid IN (SELECT accountid FROM FilteredContact)'],
  ['refuses CTE',           'WITH x AS (SELECT 1 AS a) SELECT a FROM x'],
  ['refuses GROUP BY',      'SELECT name, SUM(revenue) FROM FilteredAccount GROUP BY name'],
  ['flags GETDATE',         'SELECT name FROM FilteredAccount WHERE createdon > GETDATE()'],
  ['flags OR',              "SELECT name FROM FilteredAccount WHERE statecode = 0 OR statuscode = 1"],
  ['flags SELECT *',        'SELECT * FROM FilteredAccount']
];
for (const [label, sql] of cases) {
  const r = sqlToFetchXml(sql);
  const attrs = r.ok ? (r.fetchXml.match(/<attribute name="[^"]+"/g) || []).map(a => a.slice(17, -1)).join(',') : '';
  const cond = r.ok ? (r.fetchXml.match(/operator="[^"]+"/g) || []).map(c => c.slice(10, -1)).join(',') : '';
  console.log(`${label.padEnd(22)} ${r.ok ? 'OK  ' : 'REFUSED'}  ${attrs ? 'attrs=' + attrs : ''} ${cond ? 'ops=' + cond : ''}`);
  for (const p of r.problems || []) console.log(`     · ${p.slice(0, 96)}`);
}
