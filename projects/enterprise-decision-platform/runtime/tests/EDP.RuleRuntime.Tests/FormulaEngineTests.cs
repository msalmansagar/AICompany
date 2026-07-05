using System;
using System.Collections.Generic;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Formula;
using EDP.RuleRuntime.Operators;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class FormulaEngineTests
    {
        private static readonly DateTime FixedNow = new DateTime(2026, 7, 4, 12, 0, 0, DateTimeKind.Utc);

        private static object? Eval(string formula, Dictionary<string, object?>? inputs = null)
        {
            var ctx = new RuleExecutionContext(inputs ?? new Dictionary<string, object?>(), FixedNow);
            return new FormulaEngine().Evaluate(formula, ctx);
        }

        [Fact]
        public void String_functions_use_invariant_culture()
        {
            Assert.Equal("HELLO", Eval("Upper('hello')"));
            Assert.Equal("hello", Eval("Lower('HELLO')"));
            Assert.Equal("trimmed", Eval("Trim('  trimmed  ')"));
            Assert.Equal(5m, RuntimeValue.AsDecimal(Eval("Length('hello')")));
            Assert.Equal("ab-cd", Eval("Replace('ab_cd', '_', '-')"));
        }

        [Fact]
        public void Today_and_now_use_fixed_evaluation_clock()
        {
            Assert.Equal(FixedNow, Eval("Now()"));
            Assert.Equal(FixedNow.Date, Eval("Today()"));
        }

        [Fact]
        public void Date_arithmetic_is_deterministic()
        {
            Assert.Equal(new DateTime(2024, 1, 11, 0, 0, 0, DateTimeKind.Utc), Eval("AddDays(Date('2024-01-01'), 10)"));
            Assert.Equal(10m, RuntimeValue.AsDecimal(Eval("DateDiff(Date('2024-01-01'), Date('2024-01-11'), 'day')")));
            Assert.Equal(2024m, RuntimeValue.AsDecimal(Eval("Year(Date('2024-06-15'))")));
        }

        [Fact]
        public void Round_uses_away_from_zero()
            => Assert.Equal(2.35m, RuntimeValue.AsDecimal(Eval("Round(2.345, 2)")));

        [Fact]
        public void Coalesce_returns_first_non_empty()
            => Assert.Equal("fallback", Eval("Coalesce(missing, '', 'fallback')", new Dictionary<string, object?> { ["missing"] = null }));

        [Fact]
        public void Formula_reads_context_symbols()
        {
            var inputs = new Dictionary<string, object?> { ["firstName"] = "ada", ["lastName"] = "byron" };
            Assert.Equal("ADA BYRON", Eval("Upper(Concat(firstName, ' ', lastName))", inputs));
        }

        [Fact]
        public void Sum_and_average_are_horizon2_and_raise_clear_error()
        {
            Assert.Throws<FormulaException>(() => Eval("Sum(1, 2, 3)"));
            Assert.Throws<FormulaException>(() => Eval("Average(1, 2, 3)"));
        }

        [Fact]
        public void Same_inputs_same_clock_produce_identical_result()
        {
            var a = Eval("DateDiff(Today(), Date('2026-08-04'), 'day')");
            var b = Eval("DateDiff(Today(), Date('2026-08-04'), 'day')");
            Assert.Equal(a, b);
            Assert.Equal(31m, RuntimeValue.AsDecimal(a));
        }
    }
}
