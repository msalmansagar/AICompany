import { describe, expect, it } from 'vitest';
import { category, operatorsFor, tableToPcrm, emptyTable } from './tableModel';

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
