import { describe, expect, it } from 'vitest';
import { schemaFromMetadata, withEntitySchema, ENTITY_MARKER } from './entitySchema';
import { toPcrm } from '../translator/toPcrm';

// The canvas ↔ Dataverse bridge (EDP-DSN-002 step 3): entity metadata becomes the
// Input node's JSON Schema, and the translator turns referenced schema fields into
// typed, bound PCRM inputs (via for one-hop related fields).

const ATTRS = [
  { logicalName: 'creditlimit', displayName: 'Credit Limit', type: 'Money' },
  { logicalName: 'name', displayName: 'Name', type: 'String' },
  { logicalName: 'statuscode', displayName: 'Status Reason', type: 'Status' },
  { logicalName: 'customerid', displayName: 'Customer', type: 'Lookup' },
];
const RELS = [{ relationship: 'customerid', displayName: 'Customer', targetEntity: 'account' }];
const REL_ATTRS = { customerid: [{ logicalName: 'revenue', displayName: 'Annual Revenue', type: 'Money' }] };

function schema() { return schemaFromMetadata('qdb_loan', ATTRS, RELS, REL_ATTRS); }

describe('schemaFromMetadata', () => {
  it('should_type_fields_and_mark_the_schema_as_generated', () => {
    const s: any = schema();
    expect(s[ENTITY_MARKER]).toBe('qdb_loan');
    expect(s.properties.creditlimit).toMatchObject({ type: 'number', 'x-edp-type': 'Decimal' });
    expect(s.properties.statuscode).toMatchObject({ type: 'number', 'x-edp-type': 'OptionSet' });
    expect(s.properties.name).toMatchObject({ type: 'string', 'x-edp-type': 'Text' });
  });

  it('should_nest_related_parent_fields_under_the_lookup_with_annotations', () => {
    const s: any = schema();
    expect(s.properties.customerid).toMatchObject({ type: 'object', 'x-edp-entity': 'account', 'x-edp-relationship': 'customerid' });
    expect(s.properties.customerid.properties.revenue).toMatchObject({ type: 'number', 'x-edp-type': 'Decimal' });
  });
});

describe('withEntitySchema', () => {
  it('should_add_an_input_node_when_the_canvas_has_none', () => {
    const g: any = withEntitySchema({ nodes: [], edges: [] } as any, schema() as any);
    expect(g.nodes[0].type).toBe('inputNode');
    expect(JSON.parse(g.nodes[0].content.schema)[ENTITY_MARKER]).toBe('qdb_loan');
  });

  it('should_replace_a_previously_generated_schema', () => {
    const first: any = withEntitySchema({ nodes: [], edges: [] } as any, schema() as any);
    const other = schemaFromMetadata('qdb_invoice', ATTRS, [], {});
    const g: any = withEntitySchema(first, other as any);
    expect(JSON.parse(g.nodes[0].content.schema)[ENTITY_MARKER]).toBe('qdb_invoice');
  });

  it('should_never_overwrite_a_hand_written_schema', () => {
    const hand = JSON.stringify({ type: 'object', properties: { custom: { type: 'string' } } });
    const g: any = { nodes: [{ id: 'i', type: 'inputNode', content: { schema: hand } }], edges: [] };
    expect(withEntitySchema(g, schema() as any)).toBe(g);
  });
});

describe('toPcrm with a generated entity schema', () => {
  function graphWithTable() {
    const input = withEntitySchema({ nodes: [], edges: [] } as any, schema() as any) as any;
    input.nodes.push({
      id: 't1',
      type: 'decisionTableNode',
      content: {
        hitPolicy: 'first',
        inputs: [{ id: 'c1', field: 'creditlimit' }, { id: 'c2', field: 'customerid.revenue' }],
        outputs: [{ id: 'o1', field: 'result', name: 'result' }],
        rules: [{ c1: '> 1000', c2: '> 50000', o1: '"approve"' }],
      },
    });
    return input;
  }

  it('should_emit_typed_bindings_only_for_referenced_fields', () => {
    const pcrm: any = toPcrm(graphWithTable(), { name: 'r', targetEntity: 'qdb_loan' });
    const names = pcrm.inputs.map((i: any) => i.name).sort();
    expect(names).toEqual(['creditlimit', 'customerid.revenue']);
    const anchor = pcrm.inputs.find((i: any) => i.name === 'creditlimit');
    expect(anchor).toMatchObject({ type: 'Decimal', binding: 'creditlimit' });
  });

  it('should_emit_via_inputs_for_dotted_related_fields', () => {
    const pcrm: any = toPcrm(graphWithTable(), { name: 'r', targetEntity: 'qdb_loan' });
    const related = pcrm.inputs.find((i: any) => i.name === 'customerid.revenue');
    expect(related).toMatchObject({ type: 'Decimal', binding: 'revenue', via: { relationship: 'customerid', entity: 'account' } });
  });

  it('should_not_leak_unreferenced_anchor_fields_from_dotted_references', () => {
    // `customerid.revenue` is referenced; bare `customerid`/`revenue`/`name` are not.
    const pcrm: any = toPcrm(graphWithTable(), { name: 'r', targetEntity: 'qdb_loan' });
    const names = pcrm.inputs.map((i: any) => i.name);
    expect(names).not.toContain('name');
    expect(names).not.toContain('statuscode');
  });
});
