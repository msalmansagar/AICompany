using System;
using System.Collections.Generic;
using EDP.RuleRuntime.Operators;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class OperatorTests
    {
        [Theory]
        [InlineData("Equals", 5, 5, true)]
        [InlineData("Equals", 5, 6, false)]
        [InlineData("NotEquals", 5, 6, true)]
        [InlineData("GreaterThan", 6, 5, true)]
        [InlineData("GreaterThan", 5, 5, false)]
        [InlineData("GreaterThanOrEqual", 5, 5, true)]
        [InlineData("LessThan", 4, 5, true)]
        [InlineData("LessThanOrEqual", 5, 5, true)]
        public void Numeric_operators_compare_by_value(string op, int left, int right, bool expected)
            => Assert.Equal(expected, OperatorEvaluator.Evaluate(op, (decimal)left, (decimal)right));

        [Theory]
        [InlineData("Contains", "Hello World", "world", true)]
        [InlineData("NotContains", "Hello", "xyz", true)]
        [InlineData("StartsWith", "Hello", "he", true)]
        [InlineData("EndsWith", "Hello", "LO", true)]
        public void String_operators_are_case_insensitive(string op, string left, string right, bool expected)
            => Assert.Equal(expected, OperatorEvaluator.Evaluate(op, left, right));

        [Fact]
        public void Between_is_inclusive()
        {
            Assert.True(OperatorEvaluator.Evaluate("Between", 5m, 1m, 10m));
            Assert.True(OperatorEvaluator.Evaluate("Between", 1m, 1m, 10m));
            Assert.False(OperatorEvaluator.Evaluate("Between", 11m, 1m, 10m));
        }

        [Fact]
        public void Null_and_empty_operators()
        {
            Assert.True(OperatorEvaluator.Evaluate("IsNull", null, null));
            Assert.True(OperatorEvaluator.Evaluate("IsEmpty", "", null));
            Assert.True(OperatorEvaluator.Evaluate("IsNotEmpty", "x", null));
            Assert.False(OperatorEvaluator.Evaluate("IsNotNull", null, null));
        }

        [Fact] // EDP-DSN-002 S6 — a multi-select field's value is a collection
        public void Contains_on_a_collection_left_is_membership_not_substring()
        {
            var selected = new List<object?> { 100000000m, 100000002m };
            Assert.True(OperatorEvaluator.Evaluate("Contains", selected, 100000002m));
            Assert.False(OperatorEvaluator.Evaluate("Contains", selected, 100000001m));
            Assert.True(OperatorEvaluator.Evaluate("NotContains", selected, 100000001m));
        }

        [Fact] // EDP-DSN-002 S6
        public void In_on_a_collection_left_means_overlap()
        {
            var selected = new List<object?> { 100000000m, 100000002m };
            Assert.True(OperatorEvaluator.Evaluate("In", selected, "100000002,100000005"));
            Assert.False(OperatorEvaluator.Evaluate("In", selected, "100000001,100000005"));
            Assert.True(OperatorEvaluator.Evaluate("NotIn", selected, "100000001,100000005"));
        }

        [Fact] // EDP-DSN-002 S6
        public void Empty_collection_is_empty_but_not_null()
        {
            var none = new List<object?>();
            Assert.True(OperatorEvaluator.Evaluate("IsEmpty", none, null));
            Assert.False(OperatorEvaluator.Evaluate("IsNotEmpty", none, null));
            Assert.False(OperatorEvaluator.Evaluate("IsNull", none, null));
            Assert.False(OperatorEvaluator.Evaluate("Contains", none, 1m));
        }

        [Fact]
        public void IsNull_is_strict_and_distinct_from_IsEmpty() // QA-M1
        {
            Assert.True(OperatorEvaluator.Evaluate("IsNull", null, null));   // a real null is null
            Assert.False(OperatorEvaluator.Evaluate("IsNull", "", null));    // an empty string is NOT null
            Assert.True(OperatorEvaluator.Evaluate("IsEmpty", "", null));    // but it is empty
            Assert.True(OperatorEvaluator.Evaluate("IsEmpty", null, null));  // null is also empty
        }

        [Theory] // QA-M2 — In/NotIn had no coverage
        [InlineData("In", "Active", "Active,Pending,Closed", true)]
        [InlineData("In", "Cancelled", "Active,Pending,Closed", false)]
        [InlineData("NotIn", "Cancelled", "Active,Pending,Closed", true)]
        [InlineData("NotIn", "Active", "Active,Pending,Closed", false)]
        public void In_operators_match_comma_separated_lists(string op, string left, string list, bool expected)
            => Assert.Equal(expected, OperatorEvaluator.Evaluate(op, left, list));

        [Fact] // Regression: returned a silent false until 2026-08-18. List<decimal> is
               // IEnumerable<decimal>, variance does not apply to value types, so the
               // collection branch was missed and the operand was compared against the
               // collection's type name.
        public void In_matches_value_typed_collections()
        {
            var amounts = new List<decimal> { 5000m, 100000m };
            Assert.True(OperatorEvaluator.Evaluate("In", 5000m, amounts));
            Assert.False(OperatorEvaluator.Evaluate("In", 7777m, amounts));

            var matching = Guid.NewGuid();
            var ids = new List<Guid> { matching, Guid.NewGuid() };
            Assert.True(OperatorEvaluator.Evaluate("In", matching, ids));

            Assert.True(OperatorEvaluator.Evaluate("In", 2, new[] { 1, 2, 3 }));
        }

        [Fact]
        public void In_matches_reference_typed_collections()
        {
            var statuses = new List<object?> { "Active", "Pending" };
            Assert.True(OperatorEvaluator.Evaluate("In", "Active", statuses));
            Assert.True(OperatorEvaluator.Evaluate("NotIn", "Closed", statuses));
        }

        [Fact]
        public void Date_operators_order_by_instant()
        {
            var jan1 = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var jun1 = new DateTime(2024, 6, 1, 0, 0, 0, DateTimeKind.Utc);
            Assert.True(OperatorEvaluator.Evaluate("Before", jan1, jun1));
            Assert.True(OperatorEvaluator.Evaluate("After", jun1, jan1));
            Assert.True(OperatorEvaluator.Evaluate("OnOrBefore", jan1, jan1));
            Assert.True(OperatorEvaluator.Evaluate("OnOrAfter", jun1, jan1));
        }

        [Fact]
        public void Unknown_operator_throws()
            => Assert.Throws<NotSupportedException>(() => OperatorEvaluator.Evaluate("Frobnicate", 1m, 2m));

        [Fact]
        public void Operator_names_are_normalised()
        {
            Assert.True(OperatorEvaluator.Evaluate("greater_than", 6m, 5m));
            Assert.True(OperatorEvaluator.Evaluate("Greater Than Or Equal", 5m, 5m));
        }
    }
}
