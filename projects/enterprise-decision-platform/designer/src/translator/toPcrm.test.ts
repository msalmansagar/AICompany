import { describe, it, expect } from 'vitest';
import { translate } from './toPcrm';
import { STRICT_SCHEMA_VERSION, STRICT_INPUT_CONTRACT, LENIENT_INPUT_CONTRACT } from '../contract';

const meta = { name: 'Loan Approval', targetEntity: 'qdb_loanapplication' };

// A decision-table graph whose column IDs differ from their field/name — the exact case
// QA-M4 flagged (rows are keyed by column id, not name).
function tableGraph(): any {
  return {
    nodes: [
      { type: 'inputNode', content: { schema: JSON.stringify({ loanAmount: 0, riskRating: '' }) } },
      {
        type: 'decisionTableNode',
        content: {
          hitPolicy: 'first',
          inputs: [{ id: 'i1', field: 'loanAmount' }],
          outputs: [{ id: 'o1', name: 'approvalLevel' }],
          rules: [
            { i1: '> 500000', o1: "'CEO'" },
            { i1: '-', o1: "'Manager'" },
          ],
        },
      },
    ],
  };
}

describe('toPcrm.translate', () => {
  it('translates a decision table, indexing cells/outputs by column id (QA-M4)', () => {
    const { pcrm } = translate(tableGraph(), meta);
    expect(pcrm.logic.type).toBe('decisionTable');
    expect(pcrm.logic.tableInputs).toEqual([{ field: 'loanAmount' }]);
    expect(pcrm.logic.outputColumns).toEqual(['approvalLevel']);

    // Cells/outputs must be populated (not undefined/empty) even though id !== field/name.
    expect(pcrm.logic.rows[0].cells[0]).toEqual({ operator: 'GreaterThan', value: 500000 });
    expect(pcrm.logic.rows[0].outputs).toEqual({ approvalLevel: 'CEO' });
    expect(pcrm.logic.rows[1].cells[0]).toEqual({ any: true });
    expect(pcrm.logic.rows[1].outputs).toEqual({ approvalLevel: 'Manager' });
  });

  it('derives inputs from the input node schema', () => {
    const { pcrm } = translate(tableGraph(), meta);
    expect(pcrm.inputs).toContainEqual({ name: 'loanAmount', type: 'Decimal', binding: 'loanAmount' });
    expect(pcrm.inputs).toContainEqual({ name: 'riskRating', type: 'Text', binding: 'riskRating' });
  });

  it('falls back to table columns when there is no input node', () => {
    const g: any = { nodes: [{ type: 'decisionTableNode', content: { inputs: [{ id: 'i1', field: 'amount' }], outputs: [{ id: 'o1', name: 'r' }], rules: [] } }] };
    expect(translate(g, meta).pcrm.inputs).toContainEqual({ name: 'amount', type: 'Text', binding: 'amount' });
  });

  it('maps the collect hit policy to All', () => {
    const g = tableGraph();
    g.nodes[1].content.hitPolicy = 'collect';
    expect(translate(g, meta).pcrm.logic.hitPolicy).toBe('All');
  });

  it('parses unary-test forms: range, comparison, equals, not-equals', () => {
    const g: any = {
      nodes: [{
        type: 'decisionTableNode',
        content: {
          inputs: [{ id: 'a', field: 'x' }], outputs: [{ id: 'o', name: 'r' }],
          rules: [
            { a: '[10..20]', o: "'range'" },
            { a: '>= 5', o: "'ge'" },
            { a: '!= 3', o: "'ne'" },
            { a: '== 7', o: "'eq'" },
          ],
        },
      }],
    };
    const rows = translate(g, meta).pcrm.logic.rows;
    expect(rows[0].cells[0]).toEqual({ operator: 'Between', value: 10, value2: 20 });
    expect(rows[1].cells[0]).toEqual({ operator: 'GreaterThanOrEqual', value: 5 });
    expect(rows[2].cells[0]).toEqual({ operator: 'NotEquals', value: 3 });
    expect(rows[3].cells[0]).toEqual({ operator: 'Equals', value: 7 });
  });

  it('translates a switch node to a conditionSet with an otherwise branch', () => {
    const g: any = { nodes: [{ type: 'switchNode', content: { statements: [{ id: 's1', condition: "riskRating == 'High'" }, { id: 's2', isDefault: true }] } }] };
    const { pcrm } = translate(g, meta);
    expect(pcrm.logic.type).toBe('conditionSet');
    expect(pcrm.logic.rules[0].when.conditions[0]).toEqual({ field: 'riskRating', operator: 'Equals', value: 'High' });
    expect(pcrm.logic.otherwise).toEqual({ branch: 's2' });
  });

  it('warns about non-executable function nodes', () => {
    const g: any = { nodes: [{ type: 'functionNode', content: {} }, { type: 'decisionTableNode', content: { inputs: [], outputs: [], rules: [] } }] };
    expect(translate(g, meta).warnings.some((w) => w.includes('function node'))).toBe(true);
  });
});

// An unparseable switch condition must never translate to an empty AND group —
// empty AND evaluates true, which shipped branches that fired on every record
// (EDP-DSN-002 step 4).
function switchGraph(condition: string) {
  return {
    nodes: [
      { id: 's1', type: 'switchNode', content: { statements: [{ id: 'b1', condition }, { id: 'b2', isDefault: true }] } },
    ],
    edges: [],
  } as any;
}

describe('translate — unparseable switch conditions', () => {
  it('should_flag_an_unparseable_condition_and_poison_the_rule', () => {
    const { pcrm, warnings } = translate(switchGraph('len(items) > 2 and amount > 5'), meta);
    expect(warnings.some((w) => w.includes('not in the supported'))).toBe(true);
    const cond = (pcrm as any).logic.rules[0].when.conditions[0];
    expect(cond.field).toBe('__unparseable_condition__'); // undeclared symbol → validator EDP004 error
    expect(cond.value).toContain('len(items)');
  });

  it('should_never_emit_an_empty_always_true_condition_group', () => {
    const { pcrm } = translate(switchGraph('!!!garbage!!!'), meta);
    for (const rule of (pcrm as any).logic.rules) {
      expect(rule.when.conditions.length).toBeGreaterThan(0);
    }
  });
});

// ── B2: strict defaults — values come from the contract, not hardcoded (IC-3) ──

describe('translate — strict input contract defaults (B2, FR-B2-03)', () => {
  it('should_emit_strict_schemaVersion_and_inputContract_for_new_rules_by_default', () => {
    const { pcrm } = translate(tableGraph(), meta);
    // New rules default to strict (absent inputContract = strict).
    expect(pcrm.schemaVersion).toBe(STRICT_SCHEMA_VERSION);
    expect(pcrm.inputContract).toBe(STRICT_INPUT_CONTRACT);
  });

  it('should_emit_lenient_when_inputContract_is_lenient', () => {
    const { pcrm } = translate(tableGraph(), { ...meta, inputContract: 'lenient' });
    expect(pcrm.schemaVersion).toBe('1.0');
    expect(pcrm.inputContract).toBe(LENIENT_INPUT_CONTRACT);
  });

  it('should_derive_schemaVersion_and_inputContract_from_contract_not_hardcoded', () => {
    // If the contract changes these values, the PCRM output must follow automatically.
    const { pcrm: strict } = translate(tableGraph(), { ...meta, inputContract: 'strict' });
    const { pcrm: lenient } = translate(tableGraph(), { ...meta, inputContract: 'lenient' });
    expect(strict.schemaVersion).toBe(STRICT_SCHEMA_VERSION);
    expect(strict.inputContract).toBe(STRICT_INPUT_CONTRACT);
    expect(lenient.inputContract).toBe(LENIENT_INPUT_CONTRACT);
  });
});

// ── B1: declared facts (FR-B1-07) ─────────────────────────────────────────────

describe('translate — declared facts (B1, FR-B1-07)', () => {
  it('should_emit_declared_facts_with_source_declared_and_no_binding', () => {
    const facts = [{ name: 'tier', type: 'Text', required: false, nullable: true }];
    const { pcrm } = translate(tableGraph(), { ...meta, declaredFacts: facts });
    const tierInput = (pcrm.inputs as any[]).find((i) => i.name === 'tier');
    expect(tierInput).toBeDefined();
    expect(tierInput.source).toBe('declared');
    expect(tierInput.binding).toBeUndefined();
  });

  it('should_declared_fact_win_over_bound_input_of_same_name_FR_B1_10', () => {
    // Schema has loanAmount as a bound input; if also declared, the declared fact wins.
    const facts = [{ name: 'loanAmount', type: 'Decimal', required: true, nullable: false }];
    const { pcrm } = translate(tableGraph(), { ...meta, declaredFacts: facts });
    const matches = (pcrm.inputs as any[]).filter((i) => i.name === 'loanAmount');
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe('declared');
  });

  it('should_preserve_other_bound_inputs_when_facts_are_added', () => {
    const facts = [{ name: 'tier', type: 'Text', required: false, nullable: true }];
    const { pcrm } = translate(tableGraph(), { ...meta, declaredFacts: facts });
    // riskRating is a bound input from the schema; it must still be present
    const bound = (pcrm.inputs as any[]).find((i) => i.name === 'riskRating');
    expect(bound).toBeDefined();
    expect(bound.source).toBeUndefined();
  });
});
