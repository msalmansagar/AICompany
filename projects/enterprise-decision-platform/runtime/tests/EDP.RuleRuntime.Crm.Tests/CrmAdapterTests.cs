using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;
using EDP.RuleRuntime.Crm;
using EDP.RuleRuntime.Crm.Metadata;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    public class CrmValueConverterTests
    {
        [Fact]
        public void Converts_crm_types_to_runtime_values()
        {
            Assert.Equal(600000m, CrmValueConverter.ToRuntime(new Money(600000m)));
            Assert.Equal(2, CrmValueConverter.ToRuntime(new OptionSetValue(2)));
            var id = Guid.NewGuid();
            Assert.Equal(id, CrmValueConverter.ToRuntime(new EntityReference("qdb_x", id)));
            Assert.Equal(12.5m, CrmValueConverter.ToRuntime(12.5d));
            Assert.Null(CrmValueConverter.ToRuntime(null));
        }
    }

    public class OrgServiceMetadataResolverTests
    {
        private static FakeOrganizationService WithLoanMetadata()
        {
            var fake = new FakeOrganizationService();
            fake.Metadata["qdb_loanapplication"] = FakeOrganizationService.BuildEntity("qdb_loanapplication",
                FakeOrganizationService.Attr<MoneyAttributeMetadata>("qdb_loanamount"),
                FakeOrganizationService.Attr<StringAttributeMetadata>("qdb_riskrating"));
            return fake;
        }

        [Fact]
        public void Maps_crm_attribute_types_to_field_types()
        {
            var resolver = new OrgServiceMetadataResolver(WithLoanMetadata());

            Assert.True(resolver.EntityExists("qdb_loanapplication"));
            Assert.True(resolver.TryGetAttribute("qdb_loanapplication", "qdb_loanamount", out var money));
            Assert.Equal(FieldType.Currency, money.FieldType);
            Assert.True(resolver.TryGetAttribute("qdb_loanapplication", "qdb_riskrating", out var text));
            Assert.Equal(FieldType.Text, text.FieldType);
        }

        [Fact]
        public void Unknown_entity_reports_not_found()
            => Assert.False(new OrgServiceMetadataResolver(new FakeOrganizationService()).EntityExists("nope"));
    }

    public class SinkTests
    {
        [Fact]
        public void Audit_sink_writes_durable_record()
        {
            var fake = new FakeOrganizationService();
            new DataverseAuditSink(fake).WriteAudit(new AuditEvent
            { Action = "Published", Actor = "u", Details = "d", TimestampUtc = DateTime.UtcNow });

            var record = Assert.Single(fake.Created);
            Assert.Equal("qdb_edp_ruleaudit", record.LogicalName);
            Assert.Equal("Published", record["qdb_edp_action"]);
        }

        [Fact]
        public void Audit_sink_failure_propagates()
        {
            var fake = new FakeOrganizationService { ThrowOnCreate = true };
            Assert.Throws<InvalidOperationException>(() =>
                new DataverseAuditSink(fake).WriteAudit(new AuditEvent { Action = "x", TimestampUtc = DateTime.UtcNow }));
        }

        [Fact]
        public void Trace_sink_writes_on_success()
        {
            var fake = new FakeOrganizationService();
            new DataverseTraceSink(fake).WriteTrace(new TraceRecord { Outcome = "matched", ExecutedOnUtc = DateTime.UtcNow });
            Assert.Equal("qdb_edp_ruleexecutionlog", Assert.Single(fake.Created).LogicalName);
        }

        [Fact]
        public void Trace_sink_never_throws_and_reports_drop()
        {
            var fake = new FakeOrganizationService { ThrowOnCreate = true };
            string? dropped = null;
            var sink = new DataverseTraceSink(fake, msg => dropped = msg);

            var ex = Record.Exception(() => sink.WriteTrace(new TraceRecord { Outcome = "matched", ExecutedOnUtc = DateTime.UtcNow }));

            Assert.Null(ex);            // decision integrity: a trace failure must never surface
            Assert.NotNull(dropped);    // but the drop is recorded
        }
    }

    public class RuleDecisionServiceTests
    {
        private const string DoaRule = """
        {
          "ruleId": "doa", "name": "DOA", "targetEntity": "qdb_loanapplication",
          "inputs": [
            { "name": "loanAmount", "type": "Currency", "binding": "qdb_loanamount" },
            { "name": "riskRating", "type": "Text", "binding": "qdb_riskrating" }
          ],
          "outputs": [ { "name": "approvalLevel", "type": "Text" } ],
          "logic": { "type": "conditionSet", "rules": [
            { "when": { "op": "and", "conditions": [
                { "field": "loanAmount", "operator": "GreaterThan", "value": 500000 },
                { "field": "riskRating", "operator": "Equals", "value": "High" }
            ] }, "then": { "approvalLevel": "CEO" } }
          ], "otherwise": { "approvalLevel": "Manager" } }
        }
        """;

        private static RuleDecisionService NewService(FakeOrganizationService fake)
        {
            var metadata = new InMemoryMetadataResolver()
                .AddAttribute("qdb_loanapplication", "qdb_loanamount", FieldType.Currency)
                .AddAttribute("qdb_loanapplication", "qdb_riskrating", FieldType.Text);
            return new RuleDecisionService(fake, metadata, new DataverseTraceSink(fake));
        }

        [Fact]
        public void Binds_inputs_from_target_record_and_evaluates()
        {
            var fake = new FakeOrganizationService();
            var target = new Entity("qdb_loanapplication")
            {
                ["qdb_loanamount"] = new Money(600000m),
                ["qdb_riskrating"] = "High"
            };

            var result = NewService(fake).Evaluate(DoaRule, target, Guid.NewGuid(), Guid.NewGuid(),
                new DateTime(2026, 7, 4, 0, 0, 0, DateTimeKind.Utc));

            Assert.True(result.Success);
            Assert.Equal("CEO", result.Outputs["approvalLevel"]);
        }

        [Fact]
        public void Writes_best_effort_execution_trace_after_decision()
        {
            var fake = new FakeOrganizationService();
            var target = new Entity("qdb_loanapplication") { ["qdb_loanamount"] = new Money(100000m), ["qdb_riskrating"] = "Low" };

            NewService(fake).Evaluate(DoaRule, target, Guid.NewGuid(), Guid.NewGuid(),
                new DateTime(2026, 7, 4, 0, 0, 0, DateTimeKind.Utc));

            var trace = Assert.Single(fake.Created);
            Assert.Equal("qdb_edp_ruleexecutionlog", trace.LogicalName);
            Assert.Equal("matched", trace["qdb_edp_outcome"]); // otherwise-branch still counts as a matched decision
        }

        [Fact]
        public void Resolves_pcrm_from_rule_version_record()
        {
            var fake = new FakeOrganizationService();
            fake.RetrieveResults["qdb_edp_ruleversion"] = new Entity("qdb_edp_ruleversion")
            {
                ["qdb_edp_pcrmjson"] = DoaRule,
                ["qdb_edp_lifecyclestate"] = new OptionSetValue(100000003), // Published — required for execution (F-01)
            };

            var pcrm = NewService(fake).ResolvePcrm(Guid.NewGuid());
            Assert.Contains("DOA", pcrm);
        }
    }
}
