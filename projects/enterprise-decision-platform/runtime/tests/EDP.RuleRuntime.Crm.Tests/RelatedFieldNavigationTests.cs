using System;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm;
using EDP.RuleRuntime.Crm.Sinks;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// The in-CRM binder follows an N:1 lookup (`via`) to a related record and reads the
    /// bound field into the inputs — so a decision can depend on a parent record's field.
    /// </summary>
    public class RelatedFieldNavigationTests
    {
        // Refers if the customer Account's credit score is under 600; otherwise auto-approves.
        private const string NavPcrm = """
        {
          "ruleId": "nav", "name": "Credit Referral", "targetEntity": "qdb_loanapplication",
          "inputs": [
            { "name": "loanAmount", "type": "Currency", "binding": "qdb_loanamount" },
            { "name": "creditScore", "type": "Decimal", "binding": "qdb_creditscore",
              "via": { "relationship": "qdb_accountid", "entity": "account" } }
          ],
          "outputs": [ { "name": "decision", "type": "Text" } ],
          "logic": { "type": "decisionTable", "hitPolicy": "First",
            "tableInputs": [ { "field": "creditScore" } ],
            "outputColumns": [ "decision" ],
            "rows": [
              { "priority": 2, "cells": [ { "operator": "LessThan", "value": 600 } ], "outputs": { "decision": "Refer" } },
              { "priority": 1, "cells": [ { "any": true } ], "outputs": { "decision": "Auto" } }
            ] }
        }
        """;

        private sealed class NoTrace : ITraceSink { public void WriteTrace(TraceRecord trace) { } }

        private static RuleDecisionService Service(IOrganizationService svc)
            => new RuleDecisionService(svc, new InMemoryMetadataResolver(), new NoTrace());

        [Fact]
        public void Related_credit_score_below_threshold_drives_a_referral()
        {
            var accountId = Guid.NewGuid();
            var account = new Entity("account", accountId);
            account["qdb_creditscore"] = 550m;

            var fake = new FakeOrganizationService();
            fake.RetrieveById[accountId] = account;

            var loan = new Entity("qdb_loanapplication", Guid.NewGuid());
            loan["qdb_loanamount"] = new Money(100000m);
            loan["qdb_accountid"] = new EntityReference("account", accountId);

            var result = Service(fake).Evaluate(NavPcrm, loan, null, Guid.Empty, DateTime.UtcNow);

            Assert.True(result.Success);
            Assert.True(result.Matched);
            Assert.Equal("Refer", result.Outputs["decision"]?.ToString());
        }

        [Fact]
        public void Missing_lookup_yields_a_null_input_not_an_exception()
        {
            var fake = new FakeOrganizationService(); // no related record seeded — Retrieve must not be called
            var loan = new Entity("qdb_loanapplication", Guid.NewGuid());
            loan["qdb_loanamount"] = new Money(100000m); // no qdb_accountid on the record

            var result = Service(fake).Evaluate(NavPcrm, loan, null, Guid.Empty, DateTime.UtcNow);

            Assert.True(result.Success);
            Assert.Equal("Auto", result.Outputs["decision"]?.ToString());
        }
    }
}
