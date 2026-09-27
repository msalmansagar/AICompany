import { describe, expect, it } from 'vitest';
import { ARREAR_BUCKET_CODES } from '@dcp/domain';
import { buildCaseFilter } from '../data/collectionQueries.js';
import { BUCKET_LABELS, ORG_CODES } from '../data/schema.js';
import {
  BUCKET_ROWS, STRATEGY_NOT_ASSIGNED, cellKey, compactArrears, describeCell, matrixFetchXml, shadeStep,
  shapeMatrix, toCaseFilter, toCaseQuery, type MatrixCell,
} from '../v2/data/portfolioMatrix.js';

/**
 * The cell contract. One `MatrixCell` value must produce the aggregate's conditions and the
 * drill-down's filter from the same facts, the rows must be the domain's ten MIS buckets and nothing
 * else, and unknown must never become zero.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const EARLY = { id: 's-early', label: 'DEMO-Early stage', priority: 10 };
const LATE = { id: 's-late', label: 'DEMO-Pre-legal', priority: 30 };

const row = (bucket: number, strategy: string | null, cases: number, arrears: number) => ({
  cases, arrears, bucket, [`bucket${FORMATTED}`]: BUCKET_LABELS[bucket],
  ...(strategy ? { strategy, [`strategy${FORMATTED}`]: 'label' } : {}),
});

describe('the rows', () => {
  it('are the domain\'s ten MIS buckets, in MIS order, and are not defined here', () => {
    expect(BUCKET_ROWS).toBe(ARREAR_BUCKET_CODES);
    expect([...BUCKET_ROWS]).toEqual(['1-30', '31-60', '61-90', '91-180', '181-270', '271-360', '361-500', '501-1000', '1001-2000', '>2000']);
  });

  it.each(ARREAR_BUCKET_CODES)('bucket %s maps to exactly one registered option value', code => {
    expect(Object.values(BUCKET_LABELS).filter(label => label === code)).toHaveLength(1);
  });
});

describe('one cell, one definition', () => {
  const cell: MatrixCell = { bucket: '61-90', strategy: EARLY.id, scope: 'HL' };

  it('produces the drill-down filter the case list sends', () => {
    expect(toCaseFilter(cell)).toBe(
      `qdb_organizationcode eq ${ORG_CODES['HL']} and statecode eq 0 and _qdb_strategyid_value eq s-early and qdb_currentarrearbucket eq 100000002`,
    );
  });

  it('filters "Strategy Not Assigned" as no resolved strategy at the source', () => {
    expect(toCaseFilter({ ...cell, strategy: STRATEGY_NOT_ASSIGNED })).toContain('_qdb_strategyid_value eq null');
  });

  it('uses the same organisation and open-state conditions in the aggregate', () => {
    const fetchXml = matrixFetchXml('HL');
    const query = toCaseQuery(cell);

    expect(fetchXml).toContain(`attribute="qdb_organizationcode" operator="eq" value="${ORG_CODES['HL']}"`);
    expect(fetchXml).toContain('attribute="statecode" operator="eq" value="0"');
    expect([query.openOnly, query.scopeFilter]).toEqual([true, `qdb_organizationcode eq ${ORG_CODES['HL']}`]);
  });

  it('groups the aggregate by exactly the two columns a cell is keyed by', () => {
    const fetchXml = matrixFetchXml('all');
    expect(fetchXml).toContain('name="qdb_currentarrearbucket" alias="bucket" groupby="true"');
    expect(fetchXml).toContain('name="qdb_strategyid" alias="strategy" groupby="true"');
    expect(fetchXml).not.toContain('organizationcode');
  });

  it('measures current arrears, never exposure or balance', () => {
    const fetchXml = matrixFetchXml('all');
    expect(fetchXml).toContain('name="qdb_currenttotalarrears" alias="arrears" aggregate="sum"');
    expect(fetchXml).not.toMatch(/loanbalance|exposure/);
  });

  it('carries no DPD arithmetic — the bucket is a stored code', () => {
    expect(buildCaseFilter(toCaseQuery(cell))).not.toMatch(/qdb_currentdpd|ge |le /);
  });
});

describe('shaping the platform\'s rows', () => {
  const shaped = shapeMatrix([
    row(100000002, EARLY.id, 61, 6_100_000),
    row(100000002, null, 20, 900_000),
    row(100000009, null, 548, 125_115_361.07),
    { cases: 1, arrears: 0, strategy: null } as Record<string, unknown>,
  ], [LATE, EARLY]);

  it('orders strategy columns by priority, then Strategy Not Assigned last', () => {
    expect(shaped.columns.map(c => c.key)).toEqual([EARLY.id, LATE.id, STRATEGY_NOT_ASSIGNED]);
  });

  it('keeps a configured strategy with no cases as a column', () => {
    expect(shaped.columnTotals.get(LATE.id)).toBeUndefined();
    expect(shaped.columns.some(c => c.key === LATE.id)).toBe(true);
  });

  it('totals rows, columns and the grand total from the same rows', () => {
    expect([shaped.rowTotals.get('61-90'), shaped.columnTotals.get(STRATEGY_NOT_ASSIGNED), shaped.grandTotal]).toEqual([
      { cases: 81, arrears: 7_000_000 },
      { cases: 568, arrears: 126_015_361.07 },
      { cases: 629, arrears: 132_115_361.07 },
    ]);
  });

  it('reports a case with no bucket separately rather than inventing a row for it', () => {
    expect([shaped.unbucketed.cases, shaped.cells.size]).toEqual([1, 3]);
  });

  it('names a strategy the configuration no longer lists as retired', () => {
    const result = shapeMatrix([row(100000000, 's-old', 2, 10)], [EARLY]);
    expect(result.columns.map(c => c.label)).toEqual([EARLY.label, 'label (retired)', 'Strategy Not Assigned']);
  });
});

describe('describing a cell', () => {
  it('reads the bucket, the column, the count and the arrears, and says what opening it does', () => {
    expect(describeCell({ bucket: '61-90', strategy: EARLY.id, scope: 'all' }, 'DEMO-Early stage', { cases: 29, arrears: 3_800_000 }))
      .toBe('61 to 90 DPD, DEMO-Early stage, 29 cases, QAR 3,800,000 current arrears. Open cases.');
  });

  it('reads the top bucket as over 2000', () => {
    expect(describeCell({ bucket: '>2000', strategy: 'none', scope: 'all' }, 'Strategy Not Assigned', { cases: 1, arrears: 5 }))
      .toContain('over 2000 DPD, Strategy Not Assigned, 1 case,');
  });

  it.each([[6_100_000, 'QAR 6.1M'], [412_000, 'QAR 412K'], [3_100, 'QAR 3.1K'], [950, 'QAR 950']])('compacts %d as %s', (amount, text) => {
    expect(compactArrears(amount)).toBe(text);
  });

  it('shades by share of the largest arrears, and gives zero no shade', () => {
    expect([shadeStep(0, 100), shadeStep(1, 100), shadeStep(50, 100), shadeStep(100, 100)]).toEqual([0, 1, 3, 5]);
  });

  it('keys a cell by bucket and strategy', () => {
    expect(cellKey('1-30', 'none')).toBe('1-30|none');
  });
});
