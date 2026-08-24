import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteRule, saveRule } from './client';

// saveRule must never create a second qdb_edp_rules record for an existing rule —
// that defect duplicated the catalog on every edit-and-save (EDP-DSN-002 step 1).

interface Call { method: string; path: string; body: any; prefer?: string; }
const calls: Call[] = [];

// Mirrors REAL Dataverse create semantics, which the first version of these tests did not:
// a plain POST answers 204 with an EMPTY body and puts the new id only in the
// OData-EntityId header; the body is returned only for `Prefer: return=representation`.
// Mocking a body on every POST hid a defect that duplicated rules in the live org.
const ENTITY_ID_BASE = 'https://org.crm4.dynamics.com/api/data/v9.2';

function mockFetch(handler: (c: Call) => any) {
  (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      path: String(url),
      body: init?.body ? JSON.parse(init.body) : undefined,
      prefer: init?.headers?.Prefer,
    };
    calls.push(call);
    const result = handler(call) ?? {};
    const headers = { get: (n: string) => (n.toLowerCase() === 'odata-entityid' && result.__entityId ? `${ENTITY_ID_BASE}/${result.__entityId}` : null) };
    if (call.method === 'POST' && !String(call.prefer ?? '').includes('return=representation')) {
      return { ok: true, status: 204, headers, text: async () => '' }; // no body, id only in the header
    }
    const { __entityId, ...body } = result;
    return { ok: true, status: 200, headers, text: async () => JSON.stringify(body) };
  });
}

beforeEach(() => {
  calls.length = 0;
  (globalThis as any).window = {};
  (globalThis as any).location = { hostname: 'localhost' };
});
afterEach(() => vi.restoreAllMocks());

const DRAFT = 100000000;
const PUBLISHED = 100000003;
const RULE_ID = '11111111-1111-1111-1111-111111111111';

function versionListResponse(state: number | null, number = 3) {
  return { value: [{ qdb_edp_ruleversionid: 'v-latest', qdb_edp_versionnumber: number, qdb_edp_lifecyclestate: state }] };
}

describe('saveRule', () => {
  const VERSION_ID = '22222222-2222-2222-2222-222222222222';

  it('should_create_rule_and_version1_when_rule_is_new', async () => {
    mockFetch((c) => {
      if (c.method === 'POST' && c.path.includes('qdb_edp_rules') && !c.path.includes('ruleversion')) return { qdb_edp_ruleid: RULE_ID };
      if (c.method === 'POST' && c.path.includes('ruleversions')) return { qdb_edp_ruleversionid: VERSION_ID };
      return {};
    });
    const res = await saveRule({ name: 'R', jdmGraph: {}, pcrm: {} });
    expect(res).toMatchObject({ ruleId: RULE_ID, versionId: VERSION_ID, versionNumber: 1, lifecycle: 'Draft', updatedInPlace: false });
    const rulePosts = calls.filter((c) => c.method === 'POST' && /qdb_edp_rules\b|qdb_edp_rules\?|qdb_edp_rules$/.test(c.path) && !c.path.includes('ruleversion'));
    expect(rulePosts).toHaveLength(1);
  });

  it('should_link_the_version_to_the_rule_it_just_created', async () => {
    mockFetch((c) => {
      if (c.method === 'POST' && c.path.includes('qdb_edp_rules') && !c.path.includes('ruleversion')) return { qdb_edp_ruleid: RULE_ID };
      if (c.method === 'POST' && c.path.includes('ruleversions')) return { qdb_edp_ruleversionid: VERSION_ID };
      return {};
    });
    await saveRule({ name: 'R', jdmGraph: {}, pcrm: {} });
    const versionPost = calls.find((c) => c.method === 'POST' && c.path.includes('ruleversions'));
    // The bind must carry a REAL id — '/qdb_edp_rules(undefined)' orphaned every version.
    expect(versionPost?.body['qdb_edp_ruleid@odata.bind']).toBe(`/qdb_edp_rules(${RULE_ID})`);
  });

  it('should_recover_the_new_id_from_the_odata_entityid_header_when_no_body_comes_back', async () => {
    // A service that ignores Prefer still returns the id in the header — the id must survive.
    mockFetch((c) => {
      if (c.method === 'POST' && c.path.includes('qdb_edp_rules') && !c.path.includes('ruleversion')) return { __entityId: `qdb_edp_rules(${RULE_ID})` };
      if (c.method === 'POST' && c.path.includes('ruleversions')) return { __entityId: `qdb_edp_ruleversions(${VERSION_ID})` };
      return {};
    });
    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      const call: Call = { method: init?.method ?? 'GET', path: String(url), body: init?.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const id = call.path.includes('ruleversions') ? `qdb_edp_ruleversions(${VERSION_ID})` : `qdb_edp_rules(${RULE_ID})`;
      if (call.method === 'POST') return { ok: true, status: 204, headers: { get: (n: string) => (n.toLowerCase() === 'odata-entityid' ? `${ENTITY_ID_BASE}/${id}` : null) }, text: async () => '' };
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ value: [] }) };
    });
    const res = await saveRule({ name: 'R', jdmGraph: {}, pcrm: {} });
    expect(res.ruleId).toBe(RULE_ID);
    expect(res.versionId).toBe(VERSION_ID);
  });

  it('should_fail_loudly_when_a_create_returns_no_id_at_all', async () => {
    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      calls.push({ method: init?.method ?? 'GET', path: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
      return { ok: true, status: 204, headers: { get: () => null }, text: async () => '' };
    });
    await expect(saveRule({ name: 'R', jdmGraph: {}, pcrm: {} })).rejects.toThrow(/no id/i);
  });

  it('should_update_draft_in_place_when_latest_version_is_draft', async () => {
    mockFetch((c) => {
      if (c.method === 'GET' && c.path.includes('ruleversions')) return versionListResponse(DRAFT);
      return {};
    });
    const res = await saveRule({ ruleId: RULE_ID, name: 'R', jdmGraph: { a: 1 }, pcrm: { b: 2 } });
    expect(res).toMatchObject({ ruleId: RULE_ID, versionId: 'v-latest', versionNumber: 3, updatedInPlace: true });
    expect(calls.some((c) => c.method === 'POST' && c.path.includes('qdb_edp_rules') && !c.path.includes('ruleversion'))).toBe(false);
    const patch = calls.find((c) => c.method === 'PATCH' && c.path.includes('ruleversions(v-latest)'));
    expect(patch?.body.qdb_edp_pcrmjson).toBe(JSON.stringify({ b: 2 }));
  });

  it('should_create_next_version_when_latest_version_is_published', async () => {
    mockFetch((c) => {
      if (c.method === 'GET' && c.path.includes('ruleversions')) return versionListResponse(PUBLISHED, 4);
      if (c.method === 'POST' && c.path.includes('ruleversions')) return { qdb_edp_ruleversionid: 'v-5' };
      return {};
    });
    const res = await saveRule({ ruleId: RULE_ID, name: 'R', jdmGraph: {}, pcrm: {} });
    expect(res).toMatchObject({ ruleId: RULE_ID, versionId: 'v-5', versionNumber: 5, lifecycle: 'Draft', updatedInPlace: false });
    expect(calls.some((c) => c.method === 'POST' && c.path.includes('qdb_edp_rules') && !c.path.includes('ruleversion'))).toBe(false);
    const post = calls.find((c) => c.method === 'POST' && c.path.includes('ruleversions'));
    expect(post?.body.qdb_edp_versionnumber).toBe(5);
  });

  it('should_delete_versions_test_suite_then_rule', async () => {
    mockFetch((c) => {
      if (c.method === 'GET' && c.path.includes('ruleversions')) return { value: [{ qdb_edp_ruleversionid: 'v1' }, { qdb_edp_ruleversionid: 'v2' }] };
      if (c.method === 'GET' && c.path.includes('ruletests')) return { value: [{ qdb_edp_ruletestid: 't1' }] };
      return {};
    });
    await deleteRule(RULE_ID);
    const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => c.path.split('/').pop());
    expect(deletes).toEqual(['qdb_edp_ruleversions(v1)', 'qdb_edp_ruleversions(v2)', 'qdb_edp_ruletests(t1)', `qdb_edp_rules(${RULE_ID})`]);
  });

  it('should_leave_the_rule_record_when_a_child_delete_fails', async () => {
    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      const call: Call = { method: init?.method ?? 'GET', path: String(url), body: init?.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      if (call.method === 'DELETE' && call.path.includes('ruleversions'))
        return { ok: false, status: 403, text: async () => JSON.stringify({ error: { message: 'no permission' } }) };
      if (call.method === 'GET' && call.path.includes('ruleversions'))
        return { ok: true, status: 200, text: async () => JSON.stringify({ value: [{ qdb_edp_ruleversionid: 'v1' }] }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ value: [] }) };
    });
    await expect(deleteRule(RULE_ID)).rejects.toThrow(/left in place/);
    expect(calls.some((c) => c.method === 'DELETE' && c.path.includes(`qdb_edp_rules(${RULE_ID})`))).toBe(false);
  });

  it('should_rename_rule_record_when_saving_existing_rule', async () => {
    mockFetch((c) => {
      if (c.method === 'GET' && c.path.includes('ruleversions')) return versionListResponse(DRAFT);
      return {};
    });
    await saveRule({ ruleId: RULE_ID, name: 'Renamed', jdmGraph: {}, pcrm: {} });
    const rename = calls.find((c) => c.method === 'PATCH' && c.path.includes(`qdb_edp_rules(${RULE_ID})`));
    expect(rename?.body.qdb_edp_rulename).toBe('Renamed');
  });
});
