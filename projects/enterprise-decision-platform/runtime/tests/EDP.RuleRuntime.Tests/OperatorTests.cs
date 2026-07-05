using System;
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
