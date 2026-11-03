using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm.Retrieval;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// EDP-FACT-001 F2b — running a declared population retrieval (FR-F12, FR-F13, FR-F14).
    /// The worked case is the specimen's duplicate check: historical invoices for a beneficiary.
    /// </summary>
    public class PopulationRetrieverTests
    {
        private static readonly DateTime Now = new DateTime(2026, 8, 19, 0, 0, 0, DateTimeKind.Utc);

        private static RuleExecutionContext Context()
            => new RuleExecutionContext(
                new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["beneficiary"] = "Ahmad" }, Now);

        private static PcrmRetrieval Retrieval(int maxRows = 100)
        {
            var retrieval = new PcrmRetrieval
            {
                Name = "history",
                Entity = "qdb_invoice",
                MaxRows = maxRows,
                Filter = new PcrmGroup(),
            };
            retrieval.Select.Add("qdb_invoiceno");
            retrieval.Select.Add("qdb_issuedon");
            retrieval.Filter.Conditions.Add(new PcrmCondition
            {
                Field = "qdb_beneficiary", Operator = "Equals", ValueField = "beneficiary",
            });
            return retrieval;
        }

        private static Entity Invoice(string invoiceNo, DateTime issuedOn)
        {
            var entity = new Entity("qdb_invoice", Guid.NewGuid());
            entity["qdb_invoiceno"] = invoiceNo;
            entity["qdb_issuedon"] = issuedOn;
            return entity;
        }

        private static FakeOrganizationService Org(params Entity[] rows)
        {
            var fake = new FakeOrganizationService();
            fake.QueryResults["qdb_invoice"] = new List<Entity>(rows);
            return fake;
        }

        private static IReadOnlyDictionary<string, object?> Record(object? element)
            => (IReadOnlyDictionary<string, object?>)element!;

        [Fact]
        public void Rows_come_back_as_field_addressable_records()
        {
            var org = Org(Invoice("INV-1", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)));

            var population = new PopulationRetriever(org).Retrieve(Retrieval(), Context());

            Assert.Equal("INV-1", Record(Assert.Single(population))["qdb_invoiceno"]);
        }

        [Fact]
        public void Every_record_carries_its_id_because_a_child_verdict_is_addressed_by_it()
        {
            var invoice = Invoice("INV-1", Now);
            var population = new PopulationRetriever(Org(invoice)).Retrieve(Retrieval(), Context());

            Assert.Equal(invoice.Id.ToString(), Record(population[0])["id"]);
        }

        // ---- FR-F13: exceed the ceiling and FAIL, never truncate -------------------------

        [Fact]
        public void Exceeding_the_row_ceiling_fails_the_evaluation()
        {
            // A silently short population is indistinguishable from a small one, so a truncated
            // duplicate check would report "no duplicate found".
            var org = Org(Invoice("A", Now), Invoice("B", Now), Invoice("C", Now));

            var error = Assert.Throws<InvalidOperationException>(
                () => new PopulationRetriever(org).Retrieve(Retrieval(maxRows: 2), Context()));

            Assert.Contains("exceeded its ceiling", error.Message);
        }

        [Fact]
        public void A_population_within_the_ceiling_is_returned()
            => Assert.Equal(2, new PopulationRetriever(Org(Invoice("A", Now), Invoice("B", Now)))
                .Retrieve(Retrieval(maxRows: 2), Context()).Count);

        // ---- guard rails hold at runtime, not only at author time -------------------------

        [Fact]
        public void An_unfiltered_retrieval_is_refused_at_runtime_too()
        {
            // A PCRM payload can reach the engine without passing the validator — a live canvas
            // Test, or a hand-built call — so the guard cannot live only in the validator.
            var unfiltered = Retrieval();
            unfiltered.Filter = new PcrmGroup();

            Assert.Throws<InvalidOperationException>(
                () => new PopulationRetriever(Org()).Retrieve(unfiltered, Context()));
        }

        [Fact]
        public void A_retrieval_without_a_ceiling_is_refused_at_runtime_too()
        {
            var unbounded = Retrieval(maxRows: 0);

            Assert.Throws<InvalidOperationException>(
                () => new PopulationRetriever(Org()).Retrieve(unbounded, Context()));
        }

        // ---- FR-F14: argmax applied after retrieval ---------------------------------------

        [Fact]
        public void Group_by_collapses_the_population_to_the_latest_per_key()
        {
            var org = Org(
                Invoice("INV-1", new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc)),
                Invoice("INV-1", new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc)),
                Invoice("INV-2", new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc)));

            var retrieval = Retrieval();
            retrieval.GroupBy = new PcrmGroupByArgMax { Key = "qdb_invoiceno", By = "qdb_issuedon", Select = "latest" };

            var population = new PopulationRetriever(org).Retrieve(retrieval, Context());

            Assert.Equal(2, population.Count);
            Assert.Equal(new DateTime(2026, 5, 1, 0, 0, 0, DateTimeKind.Utc), Record(population[0])["qdb_issuedon"]);
        }

        [Fact]
        public void An_empty_population_is_returned_rather_than_throwing()
            => Assert.Empty(new PopulationRetriever(Org()).Retrieve(Retrieval(), Context()));
    }
}
