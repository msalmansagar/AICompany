using System.Linq;
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
            var right = RuntimeValue.FromJson(condition.Value);
            var right2 = condition.Value2.ValueKind == System.Text.Json.JsonValueKind.Undefined
                ? null
                : RuntimeValue.FromJson(condition.Value2);

            var outcome = OperatorEvaluator.Evaluate(condition.Operator, left, right, right2);
            context.Trace.Add("condition", $"{condition.Field} {condition.Operator} {RuntimeValue.AsString(right)}", outcome);
            return outcome;
        }
    }
}
