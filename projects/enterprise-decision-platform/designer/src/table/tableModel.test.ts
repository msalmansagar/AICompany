import { describe, expect, it } from 'vitest';
import { category, operatorsFor, tableToPcrm, emptyTable, moveRow, moveInput, tableToCsv, type TableModel } from './tableModel';

// Lookup fields as first-class table conditions (EDP-DSN-002 step 5).

describe('lookup category', () => {
  it('should_categorise_lookup_customer_and_owner_as_lookup', () => {
    expect(category('Lookup')).toBe('lookup');
    expect(category('Customer')).toBe('lookup');
    expect(category('Owner')).toBe('lookup');
  });

  it('should_offer_is_isnot_isempty_hasvalue_operators', () => {
    const ops = operatorsFor('lookup').map((o) => o.op);
    expect(ops).toEqual(['Any', 'Equals', 'NotEquals', 'IsEmpty', 'IsNotEmpty']);
  });
});

function twoColumnTable(): TableModel {
  const m = emptyTable();
  m.inputs = [
    { field: 'amount', label: 'Amount', type: 'Decimal' },
    { field: 'status', label: 'Status', type: 'String' },
  ];
  m.rows = [
    { cells: [{ operator: 'GreaterThan', value: '100' }, { any: true }], outputs: { result: 'high' }, reasonCodes: ['HIGH'] },
    { cells: [{ any: true }, { operator: 'Equals', value: 'open' }], outputs: { result: 'open' } },
  ];
  return m;
}

describe('moveRow / moveInput', () => {
  it('should_reorder_rows_and_ignore_out_of_range_moves', () => {
    const m = twoColumnTable();
    const swapped = moveRow(m, 0, 1);
    expect(swapped.rows[1].outputs.result).toBe('high');
    expect(moveRow(m, 0, -1)).toBe(m);
    expect(moveRow(m, 1, 2)).toBe(m);
  });

  it('should_move_a_column_together_with_every_rows_cells', () => {
    const m = twoColumnTable();
    const swapped = moveInput(m, 0, 1);
    expect(swapped.inputs.map((i) => i.field)).toEqual(['status', 'amount']);
    expect(swapped.rows[0].cells[1]).toMatchObject({ operator: 'GreaterThan', value: '100' });
    expect(swapped.rows[1].cells[0]).toMatchObject({ operator: 'Equals', value: 'open' });
  });
});

describe('tableToCsv', () => {
  it('should_render_headers_readable_cells_outputs_and_reason_codes', () => {
    const csv = tableToCsv(twoColumnTable());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('#,Amount,Status,result,reason codes');
    expect(lines[1]).toBe('1,> 100,any,high,HIGH');
    expect(lines[2]).toBe('2,any,= open,open,');
  });

  it('should_escape_commas_and_quotes', () => {
    const m = twoColumnTable();
    m.rows[0].outputs.result = 'a,"b"';
    const csv = tableToCsv(m);
    expect(csv).toContain('"a,""b"""');
  });
});

describe('multiselect category', () => {
  it('should_categorise_multiselectpicklist_and_type_it_optionset', () => {
    expect(category('MultiSelectPicklist')).toBe('multiselect');
  });

  it('should_offer_membership_operators', () => {
    const ops = operatorsFor('multiselect').map((o) => o.op);
    expect(ops).toEqual(['Any', 'Contains', 'NotContains', 'In', 'IsEmpty', 'IsNotEmpty']);
  });
});

describe('lookup cell serialization', () => {
  it('should_emit_the_guid_and_never_the_display_label', () => {
    const model = emptyTable();
    model.inputs = [{ field: 'customerid', label: 'Customer', type: 'Lookup' }];
    model.rows = [{
      cells: [{ operator: 'Equals', value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', valueLabel: 'Contoso Ltd' }],
      outputs: { result: 'vip' },
    }];
    const pcrm: any = tableToPcrm(model, { name: 'r', targetEntity: 'qdb_loan' });
    const cell = pcrm.logic.rows[0].cells[0];
    expect(cell).toEqual({ operator: 'Equals', value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(JSON.stringify(pcrm)).not.toContain('Contoso');
  });

  it('should_serialize_isempty_without_a_value', () => {
    const model = emptyTable();
    model.inputs = [{ field: 'customerid', label: 'Customer', type: 'Lookup' }];
    model.rows = [{ cells: [{ operator: 'IsEmpty' }], outputs: { result: 'no-customer' } }];
    const pcrm: any = tableToPcrm(model, { name: 'r', targetEntity: 'qdb_loan' });
    expect(pcrm.logic.rows[0].cells[0].operator).toBe('IsEmpty');
    expect(pcrm.logic.rows[0].cells[0].value).toBeNull();
  });
});
