using System;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using EDP.RuleRuntime.Crm;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// Offline tests for the Phase-5/6 Custom API adapters. They invoke the real plugins
    /// through a fake plugin pipeline (fake IServiceProvider / context / org) so the shipped
    /// code paths — message-name branching, PCRM projection, static analysis, guard — are
    /// exercised with NO CRM required.
    /// </summary>
    public class NewAdapterTests
    {
        // ---- test PCRM payloads --------------------------------------------------------

        private const string TablePcrm = """
        {
          "ruleId": "loan", "name": "Loan Approval", "targetEntity": "qdb_loanapplication",
          "inputs": [
            { "name": "loanAmount", "type": "Currency", "binding": "qdb_loanamount" },
            { "name": "riskRating", "type": "Text", "binding": "qdb_riskrating" }
          ],
          "variables": [ { "name": "upperRisk", "type": "Text", "formula": "EDP_Upper(riskRating)" } ],
          "outputs": [ { "name": "approvalLevel", "type": "Text" } ],
          "logic": { "type": "decisionTable", "hitPolicy": "First",
            "tableInputs": [ { "field": "loanAmount" } ],
            "outputColumns": [ "approvalLevel" ],
            "rows": [ { "priority": 1, "cells": [ { "operator": "GreaterThan", "value": 500000 } ], "outputs": { "approvalLevel": "CEO" } } ] }
        }
        """;

        private const string ConditionPcrm = """
        {
          "ruleId": "doa", "name": "DOA", "targetEntity": "qdb_loanapplication",
          "inputs": [
            { "name": "loanAmount", "type": "Currency", "binding": "qdb_loanamount" },
            { "name": "riskRating", "type": "Text", "binding": "qdb_riskrating" }
          ],
          "outputs": [ { "name": "approvalLevel", "type": "Text" }, { "name": "neverSet", "type": "Text" } ],
          "logic": { "type": "conditionSet", "rules": [
            { "when": { "op": "and", "conditions": [
                { "field": "loanAmount", "operator": "GreaterThan", "value": 500000 },
                { "field": "loanAmount", "operator": "GreaterThan", "value": 500000 }
            ] }, "then": { "approvalLevel": "CEO" } }
          ], "otherwise": { "approvalLevel": "Manager" } }
        }
        """;

        // ---- RuleAnalysisPlugin --------------------------------------------------------

        [Fact]
        public void ExplainRule_narrates_structure_from_pcrm()
        {
            var json = InvokeResult(new RuleAnalysisPlugin(), new FakeOrganizationService(),
                "qdb_edp_ExplainRule", ("PcrmJson", TablePcrm));
            var business = Root(json).GetProperty("business").GetString();
            Assert.Contains("Loan Approval", business);
            Assert.Contains("decision table", business);
        }

        [Fact]
        public void GetDependencies_extracts_fields_and_functions()
        {
            var json = InvokeResult(new RuleAnalysisPlugin(), new FakeOrganizationService(),
                "qdb_edp_GetDependencies", ("PcrmJson", TablePcrm));
            Assert.Contains("qdb_loanamount", json);   // field binding
            Assert.Contains("EDP_Upper", json);        // function from a variable formula
        }

        [Fact]
        public void AnalyzeRule_flags_duplicate_condition_and_unused_output()
        {
            var json = InvokeResult(new RuleAnalysisPlugin(), new FakeOrganizationService(),
                "qdb_edp_AnalyzeRule", ("PcrmJson", ConditionPcrm));
            Assert.True(Root(json).GetProperty("findingCount").GetInt32() >= 2);
            Assert.Contains("duplicate-condition", json);
            Assert.Contains("unused-output", json);
        }

        [Fact]
        public void CompareVersions_detects_logic_type_change()
        {
            var fake = new FakeOrganizationService();
            var idA = Guid.NewGuid();
            var idB = Guid.NewGuid();
            fake.RetrieveById[idA] = new Entity("qdb_edp_ruleversion") { ["qdb_edp_pcrmjson"] = TablePcrm };
            fake.RetrieveById[idB] = new Entity("qdb_edp_ruleversion") { ["qdb_edp_pcrmjson"] = ConditionPcrm };

            var json = InvokeResult(new RuleAnalysisPlugin(), fake, "qdb_edp_CompareVersions",
                ("RuleVersionIdA", idA.ToString()), ("RuleVersionIdB", idB.ToString()));

            Assert.True(Root(json).GetProperty("logicTypeChanged").GetBoolean());
        }

        // ---- RuleServicePlugin ---------------------------------------------------------

        [Fact]
        public void ValidateRule_reports_valid_for_well_formed_rule()
        {
            var json = InvokeResult(new RuleServicePlugin(), WithLoanMetadata(),
                "qdb_edp_ValidateRule", ("PcrmJson", TablePcrm));
            Assert.True(Root(json).GetProperty("isValid").GetBoolean());
            Assert.Equal(0, Root(json).GetProperty("errorCount").GetInt32());
        }

        [Fact]
        public void TestRule_executes_against_supplied_inputs()
        {
            var json = InvokeResult(new RuleServicePlugin(), WithLoanMetadata(), "qdb_edp_TestRule",
                ("PcrmJson", TablePcrm), ("InputsJson", "{\"loanAmount\":600000,\"riskRating\":\"High\"}"));
            var root = Root(json);
            Assert.True(root.GetProperty("matched").GetBoolean());
            Assert.Equal("CEO", root.GetProperty("outputs").GetProperty("approvalLevel").GetString());
            Assert.Equal("test", root.GetProperty("executionSource").GetString());
        }

        [Fact]
        public void GetRuleTemplates_lists_seeded_templates()
        {
            var fake = new FakeOrganizationService();
            fake.QueryResults["qdb_edp_ruletemplate"] = new System.Collections.Generic.List<Entity>
            {
                new Entity("qdb_edp_ruletemplate", Guid.NewGuid()) { ["qdb_edp_ruletemplatename"] = "Loan DOA", ["qdb_edp_industry"] = "Banking" }
            };
            var json = InvokeResult(new RuleServicePlugin(), fake, "qdb_edp_GetRuleTemplates");
            Assert.Equal(1, Root(json).GetProperty("templateCount").GetInt32());
            Assert.Contains("Loan DOA", json);
        }

        // ---- RuleMetadataPlugin --------------------------------------------------------

        [Fact]
        public void GetInputSchema_projects_declared_inputs()
        {
            var fake = new FakeOrganizationService();
            fake.RetrieveResults["qdb_edp_ruleversion"] = new Entity("qdb_edp_ruleversion", Guid.NewGuid()) { ["qdb_edp_pcrmjson"] = TablePcrm };
            var json = InvokeResult(new RuleMetadataPlugin(), fake, "qdb_edp_GetInputSchema",
                ("RuleVersionId", Guid.NewGuid().ToString()));
            Assert.Contains("loanAmount", json);
            Assert.Contains("riskRating", json);
        }

        // ---- DecisionIntelligencePlugin ------------------------------------------------

        [Fact]
        public void ExplainDecision_narrates_a_recorded_trace()
        {
            var fake = new FakeOrganizationService();
            var logId = Guid.NewGuid();
            fake.RetrieveById[logId] = new Entity("qdb_edp_ruleexecutionlog", logId)
            {
                ["qdb_edp_ruleexecutionlogname"] = "run-1",
                ["qdb_edp_outcome"] = "matched",
                ["qdb_edp_durationms"] = 12,
                ["qdb_edp_tracejson"] = "[{\"kind\":\"condition\",\"description\":\"loanAmount GreaterThan 500000\",\"result\":true}]"
            };
            var json = InvokeResult(new DecisionIntelligencePlugin(), fake, "qdb_edp_ExplainDecision",
                ("ExecutionLogId", logId.ToString()));
            Assert.Contains("MATCHED", Root(json).GetProperty("business").GetString());
        }

        // ---- AppendOnlyGuardPlugin -----------------------------------------------------

        [Fact]
        public void AppendOnlyGuard_blocks_update()
        {
            var ctx = new FakePluginContext { MessageName = "Update", PrimaryEntityName = "qdb_edp_ruleaudit" };
            ctx.InputParameters["Target"] = new Entity("qdb_edp_ruleaudit");
            var ex = Assert.Throws<InvalidPluginExecutionException>(
                () => new AppendOnlyGuardPlugin().Execute(new FakeServiceProvider(ctx, new FakeOrganizationService())));
            Assert.Contains("append-only", ex.Message);
        }

        // ---- helpers -------------------------------------------------------------------

        private static FakeOrganizationService WithLoanMetadata()
        {
            var fake = new FakeOrganizationService();
            fake.Metadata["qdb_loanapplication"] = FakeOrganizationService.BuildEntity("qdb_loanapplication",
                FakeOrganizationService.Attr<MoneyAttributeMetadata>("qdb_loanamount"),
                FakeOrganizationService.Attr<StringAttributeMetadata>("qdb_riskrating"));
            return fake;
        }

        private static string InvokeResult(IPlugin plugin, IOrganizationService svc, string message, params (string, object)[] inputs)
        {
            var ctx = new FakePluginContext { MessageName = message };
            foreach (var (k, v) in inputs) ctx.InputParameters[k] = v;
            plugin.Execute(new FakeServiceProvider(ctx, svc));
            return (string)ctx.OutputParameters["ResultJson"];
        }

        private static JsonElement Root(string json) => JsonDocument.Parse(json).RootElement;
    }
}
