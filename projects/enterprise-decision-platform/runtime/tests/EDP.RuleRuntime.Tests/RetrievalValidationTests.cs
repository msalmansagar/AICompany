using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// EDP-FACT-001 F2 — author-time gates on population retrieval (FR-F11, FR-F13, FR-F14).
    /// These are guard rails rather than style checks: an unfiltered or unbounded read is how a
    /// rule quietly scans a table during a payment run.
    /// </summary>
    public class RetrievalValidationTests
    {
        private static InMemoryMetadataResolver Metadata()
            => new InMemoryMetadataResolver().AddAttribute("qdb_invoice", "qdb_invoiceno", FieldType.Text);

        private static PcrmRetrieval Retrieval() => new PcrmRetrieval
        {
            Name = "history",
            Entity = "qdb_invoice",
            Select = { "qdb_invoiceno" },
            MaxRows = 500,
            Filter = new PcrmGroup
            {
                Conditions = { new PcrmCondition { Field = "qdb_invoiceno", Operator = "Equals", ValueField = "invoiceNo" } },
            },
        };

        private static PcrmDocument RuleWith(PcrmRetrieval retrieval) => new PcrmDocument
        {
            RuleId = "r", Name = "Retrieval rule", TargetEntity = "qdb_disbursement",
            Inputs = { new PcrmInput { Name = "invoiceNo", Type = "Text" } },
            Outputs = { new PcrmOutput { Name = "verdict", Type = "Text" } },
            Retrievals = { retrieval },
            Logic = new PcrmLogic
            {
                Type = "conditionSet",
                Rules = { new PcrmConditionRule { When = new PcrmGroup {
                    Quantifiers = { new PcrmQuantifier { Kind = "some", Collection = "history",
                        Where = new PcrmGroup { Conditions = { new PcrmCondition { Field = "qdb_invoiceno", Operator = "IsNotEmpty" } } } } } } } },
            },
        };

        private static IReadOnlyList<RuleDiagnostic> Validate(PcrmDocument doc)
            => new RuleValidator(Metadata()).Validate(doc);

        private static bool HasError(IEnumerable<RuleDiagnostic> diagnostics, string code)
            => diagnostics.Any(d => d.Code == code && d.Severity == RuleErrorSeverity.Error);

        [Fact]
        public void A_well_formed_retrieval_produces_no_errors()
            => Assert.DoesNotContain(Validate(RuleWith(Retrieval())), d => d.Severity == RuleErrorSeverity.Error);

        [Fact]
        public void A_retrieval_declares_a_collection_symbol_that_quantifiers_can_reference()
        {
            // Without this the quantifier over 'history' would be reported as an undeclared
            // collection, since 'history' is not an input or a variable.
            Assert.DoesNotContain(Validate(RuleWith(Retrieval())), d => d.Code == "EDP041");
        }

        [Fact]
        public void An_unfiltered_retrieval_is_rejected()
        {
            var unfiltered = Retrieval();
            unfiltered.Filter = null;

            Assert.True(HasError(Validate(RuleWith(unfiltered)), "EDP052"));
        }

        [Fact]
        public void An_empty_filter_counts_as_unfiltered()
        {
            var empty = Retrieval();
            empty.Filter = new PcrmGroup();

            Assert.True(HasError(Validate(RuleWith(empty)), "EDP052"));
        }

        [Fact]
        public void A_retrieval_without_a_row_ceiling_is_rejected()
        {
            var unbounded = Retrieval();
            unbounded.MaxRows = 0;

            Assert.True(HasError(Validate(RuleWith(unbounded)), "EDP053"));
        }

        [Fact]
        public void A_retrieval_over_an_unknown_entity_is_rejected()
        {
            var ghost = Retrieval();
            ghost.Entity = "qdb_ghost";

            Assert.True(HasError(Validate(RuleWith(ghost)), "EDP051"));
        }

        [Fact]
        public void A_retrieval_name_colliding_with_an_input_is_rejected()
        {
            var collides = Retrieval();
            collides.Name = "invoiceNo";

            Assert.True(HasError(Validate(RuleWith(collides)), "EDP050"));
        }

        [Fact]
        public void Grouping_without_a_key_or_ordering_field_is_rejected()
        {
            var grouped = Retrieval();
            grouped.GroupBy = new PcrmGroupByArgMax { Key = "", By = "", Select = "latest" };

            Assert.True(HasError(Validate(RuleWith(grouped)), "EDP054"));
        }

        [Fact]
        public void An_unknown_group_selection_is_rejected()
        {
            var grouped = Retrieval();
            grouped.GroupBy = new PcrmGroupByArgMax { Key = "qdb_invoiceno", By = "createdon", Select = "median" };

            Assert.True(HasError(Validate(RuleWith(grouped)), "EDP055"));
        }
    }
}
