using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Crm.Retrieval;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    /// <summary>
    /// EDP-FACT-001 F2b — pushing a retrieval filter to the server (FR-F10, FR-F11).
    ///
    /// The filter must reach Dataverse rather than being applied after the fact, which is why
    /// FR-F11 makes it mandatory: a read that filters in memory has already fetched the table.
    /// Anything that cannot be translated faithfully is refused rather than approximated — a
    /// filter that quietly means something else produces a plausible population and a wrong
    /// decision, which is the worst failure available here.
    /// </summary>
    public class RetrievalFilterTranslatorTests
    {
        private static readonly DateTime Now = new DateTime(2026, 8, 19, 0, 0, 0, DateTimeKind.Utc);

        private static RuleExecutionContext Context(params (string Name, object? Value)[] inputs)
        {
            var dictionary = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var (name, value) in inputs) dictionary[name] = value;
            return new RuleExecutionContext(dictionary, Now);
        }

        private static JsonElement Json(string raw) => JsonDocument.Parse(raw).RootElement.Clone();

        private static PcrmGroup Group(params PcrmCondition[] conditions)
        {
            var group = new PcrmGroup();
            foreach (var condition in conditions) group.Conditions.Add(condition);
            return group;
        }

        // ---- runtime values (FR-F10) ---------------------------------------------------

        [Fact]
        public void A_condition_resolves_its_value_from_the_execution_context()
        {
            var filter = RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "qdb_invoiceno", Operator = "Equals", ValueField = "invoiceNo" }),
                Context(("invoiceNo", "INV-5521")));

            var condition = Assert.Single(filter.Conditions);
            Assert.Equal("qdb_invoiceno", condition.AttributeName);
            Assert.Equal(ConditionOperator.Equal, condition.Operator);
            Assert.Equal("INV-5521", Assert.Single(condition.Values));
        }

        [Fact]
        public void A_literal_value_translates_without_a_context_lookup()
        {
            var filter = RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "qdb_amount", Operator = "GreaterThan", Value = Json("5000") }),
                Context());

            Assert.Equal(ConditionOperator.GreaterThan, Assert.Single(filter.Conditions).Operator);
        }

        // ---- structure -----------------------------------------------------------------

        [Fact]
        public void An_or_group_becomes_an_or_filter()
        {
            var group = Group(new PcrmCondition { Field = "a", Operator = "Equals", Value = Json("1") });
            group.Op = "or";

            Assert.Equal(LogicalOperator.Or, RetrievalFilterTranslator.Translate(group, Context()).FilterOperator);
        }

        [Fact]
        public void Nested_groups_become_nested_filters()
        {
            var outer = Group(new PcrmCondition { Field = "a", Operator = "Equals", Value = Json("1") });
            outer.Groups.Add(Group(new PcrmCondition { Field = "b", Operator = "Equals", Value = Json("2") }));

            var filter = RetrievalFilterTranslator.Translate(outer, Context());

            Assert.Single(filter.Conditions);
            Assert.Single(filter.Filters);
        }

        // ---- refusals, not approximations ----------------------------------------------

        [Fact]
        public void A_negated_filter_is_refused_rather_than_silently_rewritten()
        {
            // Dataverse FilterExpression has no NOT. De Morgan-ing it would change the author's
            // structure, so this is refused rather than reinterpreted.
            var negated = Group(new PcrmCondition { Field = "a", Operator = "Equals", Value = Json("1") });
            negated.Negate = true;

            Assert.Throws<NotSupportedException>(() => RetrievalFilterTranslator.Translate(negated, Context()));
        }

        [Fact]
        public void IsEmpty_is_refused_because_the_server_cannot_distinguish_empty_from_null()
            => Assert.Throws<NotSupportedException>(() => RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "a", Operator = "IsEmpty" }), Context()));

        [Fact]
        public void Contains_is_refused_because_server_semantics_differ_from_the_in_memory_operator()
            => Assert.Throws<NotSupportedException>(() => RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "a", Operator = "Contains", Value = Json("\"x\"") }), Context()));

        [Fact]
        public void A_condition_without_a_field_is_refused()
            => Assert.Throws<NotSupportedException>(() => RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "", Operator = "Equals", Value = Json("1") }), Context()));

        // ---- null handling --------------------------------------------------------------

        [Fact]
        public void Equals_null_becomes_a_null_test_rather_than_matching_nothing()
        {
            var filter = RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "a", Operator = "Equals", ValueField = "missing" }), Context());

            Assert.Equal(ConditionOperator.Null, Assert.Single(filter.Conditions).Operator);
        }

        [Fact]
        public void NotEquals_null_becomes_a_not_null_test()
        {
            var filter = RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "a", Operator = "NotEquals", ValueField = "missing" }), Context());

            Assert.Equal(ConditionOperator.NotNull, Assert.Single(filter.Conditions).Operator);
        }

        [Fact]
        public void A_comparison_against_null_is_refused_rather_than_matching_nothing()
            => Assert.Throws<NotSupportedException>(() => RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "a", Operator = "GreaterThan", ValueField = "missing" }), Context()));

        // ---- between --------------------------------------------------------------------

        [Fact]
        public void Between_carries_both_bounds()
        {
            var filter = RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "a", Operator = "Between", Value = Json("1"), Value2 = Json("10") }),
                Context());

            Assert.Equal(2, Assert.Single(filter.Conditions).Values.Count);
        }

        [Fact]
        public void Between_without_an_upper_bound_is_refused()
            => Assert.Throws<NotSupportedException>(() => RetrievalFilterTranslator.Translate(
                Group(new PcrmCondition { Field = "a", Operator = "Between", Value = Json("1") }), Context()));
    }
}
