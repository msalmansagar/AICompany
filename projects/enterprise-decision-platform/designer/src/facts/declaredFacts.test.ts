import { describe, it, expect } from 'vitest';
import {
  toPcrmDeclaredInput, extractDeclaredFacts, mergeDeclaredFacts,
  newDeclaredFact, DECLARED_FACT_TYPES,
  isDeclaredInput, emptyValueFor, declaredFactValues, factAttributes, withDeclaredFacts,
} from './declaredFacts';
import { STRICT_COMPATIBLE_TYPES } from '../contract';

const fact = (name: string, type = 'Text', required = false, nullable = true) =>
  ({ name, type, required, nullable });

describe('toPcrmDeclaredInput', () => {
  it('should_emit_source_declared_with_no_binding', () => {
    const out = toPcrmDeclaredInput(fact('tier', 'Text'));
    expect(out.source).toBe('declared');
    expect((out as any).binding).toBeUndefined();
    expect(out.name).toBe('tier');
    expect(out.type).toBe('Text');
    expect(out.required).toBe(false);
    expect(out.nullable).toBe(true);
  });
});

describe('extractDeclaredFacts', () => {
  it('should_return_only_inputs_with_source_declared', () => {
    const inputs = [
      { name: 'amount', type: 'Decimal', binding: 'qdb_amount' },
      { name: 'tier', type: 'Text', source: 'declared', required: false, nullable: true },
    ];
    const facts = extractDeclaredFacts(inputs);
    expect(facts).toHaveLength(1);
    expect(facts[0].name).toBe('tier');
  });

  it('should_default_nullable_true_when_absent', () => {
    const [f] = extractDeclaredFacts([{ name: 'x', type: 'Text', source: 'declared' }]);
    expect(f.nullable).toBe(true);
  });

  it('should_return_empty_for_non_array_input', () => {
    expect(extractDeclaredFacts(null as unknown as unknown[])).toHaveLength(0);
    expect(extractDeclaredFacts([])).toHaveLength(0);
  });
});

describe('mergeDeclaredFacts', () => {
  it('should_append_declared_facts_after_bound_inputs', () => {
    const bound = [{ name: 'amount', type: 'Decimal', binding: 'amount' }];
    const merged = mergeDeclaredFacts(bound, [fact('tier')]);
    expect(merged).toHaveLength(2);
    expect((merged[1] as any).source).toBe('declared');
  });

  it('should_drop_bound_input_when_declared_fact_has_same_name_FR_B1_10', () => {
    const bound = [{ name: 'tier', type: 'Text', binding: 'tier' }];
    const merged = mergeDeclaredFacts(bound, [fact('tier', 'WholeNumber')]);
    expect(merged).toHaveLength(1);
    expect((merged[0] as any).source).toBe('declared');
    expect((merged[0] as any).type).toBe('WholeNumber');
  });

  it('should_return_original_list_when_no_facts', () => {
    const bound = [{ name: 'x', binding: 'x' }];
    expect(mergeDeclaredFacts(bound, [])).toBe(bound);
  });
});

describe('DECLARED_FACT_TYPES', () => {
  it('should_derive_from_contract_and_exclude_lookup', () => {
    expect(DECLARED_FACT_TYPES.length).toBe(STRICT_COMPATIBLE_TYPES.length);
    expect(DECLARED_FACT_TYPES.some((t) => t.name === 'Lookup')).toBe(false);
    expect(DECLARED_FACT_TYPES.some((t) => t.name === 'Text')).toBe(true);
    expect(DECLARED_FACT_TYPES.some((t) => t.name === 'Decimal')).toBe(true);
  });

  it('should_match_contract_labels_exactly', () => {
    const textType = DECLARED_FACT_TYPES.find((t) => t.name === 'Text');
    expect(textType?.label).toBe('Text');
  });
});

describe('newDeclaredFact', () => {
  it('should_create_with_safe_defaults', () => {
    const f = newDeclaredFact('myFact');
    expect(f.name).toBe('myFact');
    expect(f.type).toBe('Text');
    expect(f.required).toBe(false);
    expect(f.nullable).toBe(true);
  });
});

// ── Release 1 review fixes ────────────────────────────────────────────────────

describe('isDeclaredInput', () => {
  it('should_treat_a_legacy_unbound_input_without_a_marker_as_declared_FR_B1_02', () => {
    expect(isDeclaredInput({ name: 'tier', type: 'Text' })).toBe(true);
  });
  it('should_treat_a_bound_input_as_not_declared', () => {
    expect(isDeclaredInput({ name: 'revenue', type: 'Decimal', binding: 'revenue' })).toBe(false);
  });
  it('should_round_trip_the_live_chained_tier_input', () => {
    expect(extractDeclaredFacts([{ name: 'tier', type: 'Text' }]).map((f) => f.name)).toEqual(['tier']);
  });
});

describe('emptyValueFor', () => {
  it('should_start_text_as_an_empty_string', () => { expect(emptyValueFor('Text')).toBe(''); });
  it('should_start_a_number_as_null_never_a_quoted_placeholder', () => { expect(emptyValueFor('Decimal')).toBeNull(); });
});

describe('declaredFactValues', () => {
  const facts = [newDeclaredFact('tier'), newDeclaredFact('score', 'WholeNumber')];
  it('should_keep_the_values_the_author_typed_for_declared_facts', () => {
    expect(declaredFactValues('{"tier":"A","score":7,"revenue":5}', facts)).toEqual({ tier: 'A', score: 7 });
  });
  it('should_keep_nothing_when_the_text_is_not_json', () => {
    expect(declaredFactValues('{not json', facts)).toEqual({});
  });
});

describe('factAttributes', () => {
  it('should_offer_scalar_facts_as_pickable_fields', () => {
    expect(factAttributes([newDeclaredFact('score', 'WholeNumber')])).toEqual([{ logicalName: 'score', displayName: 'score (fact)', type: 'Integer' }]);
  });
  it('should_not_offer_a_collection_as_a_scalar_field', () => {
    expect(factAttributes([newDeclaredFact('lines', 'Collection')])).toEqual([]);
  });
});

describe('withDeclaredFacts', () => {
  it('should_mark_each_fact_in_the_gorules_input_schema_as_declared', () => {
    const schema = withDeclaredFacts({ type: 'object', properties: { revenue: { type: 'number' } } }, [newDeclaredFact('tier')]);
    expect((schema.properties as any).tier['x-edp-kind']).toBe('declared');
  });
  it('should_keep_the_entity_fields', () => {
    const schema = withDeclaredFacts({ type: 'object', properties: { revenue: { type: 'number' } } }, [newDeclaredFact('tier')]);
    expect(Object.keys(schema.properties as object)).toEqual(['revenue', 'tier']);
  });
});
