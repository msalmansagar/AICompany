// Read-only smoke calls for after a re-point. Each operation below was checked to perform no
// create/update/delete (RuleServicePlugin.GetRuleTemplates, .ValidateRule; RuleAnalysisPlugin).
// EvaluateDecision is deliberately absent: it writes an execution-log row on every call.

const QUANTIFIER_PROBE = JSON.stringify({
  schemaVersion: '1.0', ruleId: 'a7-smoke', name: 'A7 smoke probe (inline, never stored)', targetEntity: 'account',
  inputs: [{ name: 'revenue', type: 'Decimal', binding: 'revenue' }], variables: [], outputs: [{ name: 'o', type: 'Text' }],
  logic: { type: 'conditionSet', rules: [{ when: { op: 'and', conditions: [], quantifiers: [{ kind: 'some', collection: 'undeclaredItems', where: { op: 'and', conditions: [{ field: 'amount', operator: 'GreaterThan', value: 1 }] } }] }, then: { o: 'x' } }], otherwise: { o: 'y' } },
});

/**
 * Each check answers a pass/fail with evidence. ValidateRule must report EDP041, a diagnostic
 * only post-F1 code produces — so it proves which code is executing, not merely that it answered.
 */
export const SMOKE_CHECKS = Object.freeze([
  {
    name: 'GetRuleTemplates answers (function, no parameters)',
    run: (client) => client.get('qdb_edp_GetRuleTemplates()'),
    passes: (response) => typeof response?.ResultJson === 'string',
  },
  {
    name: 'ValidateRule reports EDP041 (proves post-F1 code is executing)',
    run: (client) => client.post('qdb_edp_ValidateRule', { PcrmJson: QUANTIFIER_PROBE }),
    passes: (response) => typeof response?.ResultJson === 'string' && response.ResultJson.includes('EDP041'),
  },
  {
    name: 'AnalyzeRule answers for an inline rule (function)',
    run: (client) => client.get(`qdb_edp_AnalyzeRule(PcrmJson=@p)?@p=${encodeURIComponent(`'${QUANTIFIER_PROBE.replace(/'/g, "''")}'`)}`),
    passes: (response) => typeof response?.ResultJson === 'string',
  },
]);

/** Run every smoke check; answers [{ name, passed, evidence }]. Never throws. */
export async function runSmoke(client, checks = SMOKE_CHECKS) {
  const results = [];
  for (const check of checks) {
    try {
      const response = await check.run(client);
      results.push({ name: check.name, passed: check.passes(response), evidence: String(response?.ResultJson ?? '').slice(0, 160) });
    } catch (error) {
      results.push({ name: check.name, passed: false, evidence: error.message.slice(0, 200) });
    }
  }
  return results;
}
