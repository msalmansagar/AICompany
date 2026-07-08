using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Evaluation
{
    /// <summary>
    /// Evaluates a boolean group tree (AND/OR, negation, nesting) against the context.
    /// Composite pattern: a group is conditions + nested groups combined by its operator.
    /// Records each leaf and group outcome in the trace.
    /// </summary>
    public sealed class ConditionEvaluator
    {
        public bool Evaluate(PcrmGroup group, RuleExecutionContext context)
        {
            var isAnd = group.Op.ToLowerInvariant() != "or";
            bool result = isAnd; // AND starts true, OR starts false

            foreach (var condition in group.Conditions)
            {
                var c = EvaluateCondition(condition, context);
                result = isAnd ? (result && c) : (result || c);
            }

            foreach (var nested in group.Groups)
            {
                var g = Evaluate(nested, context);
                result = isAnd ? (result && g) : (result || g);
            }

            if (group.Negate) result = !result;
            context.Trace.Add("group", $"{(group.Negate ? "NOT " : string.Empty)}{group.Op.ToUpperInvariant()} of {group.Conditions.Count + group.Groups.Count}", result);
            return result;
        }

        private bool EvaluateCondition(PcrmCondition condition, RuleExecutionContext context)
        {
            context.TryResolve(condition.Field, out var left);
            var right = ResolveOperand(condition.ValueField, condition.Value, context);
            var right2 = HasOperand(condition.Value2Field, condition.Value2)
                ? ResolveOperand(condition.Value2Field, condition.Value2, context)
                : null;

            var outcome = OperatorEvaluator.Evaluate(condition.Operator, left, right, right2);
            var rhs = string.IsNullOrEmpty(condition.ValueField) ? RuntimeValue.AsString(right) : $"[{condition.ValueField}]";
            context.Trace.Add("condition", $"{condition.Field} {condition.Operator} {rhs}", outcome);
            return outcome;
        }

        /// <summary>Right operand is a referenced field (resolved from the context) or a literal.</summary>
        internal static object? ResolveOperand(string? field, JsonElement literal, RuleExecutionContext context)
        {
            if (!string.IsNullOrEmpty(field)) { context.TryResolve(field!, out var value); return value; }
            return literal.ValueKind == JsonValueKind.Undefined ? null : RuntimeValue.FromJson(literal);
        }

        internal static bool HasOperand(string? field, JsonElement literal)
            => !string.IsNullOrEmpty(field) || literal.ValueKind != JsonValueKind.Undefined;
    }
}
