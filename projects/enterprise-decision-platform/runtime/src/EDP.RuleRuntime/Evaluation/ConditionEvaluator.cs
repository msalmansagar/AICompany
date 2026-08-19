using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Evaluation
{
    /// <summary>
    /// Evaluates a boolean group tree (AND/OR, negation, nesting) against the context.
    /// Composite pattern: a group is conditions, quantifiers and nested groups combined by
    /// its operator. Records each leaf, quantifier and group outcome in the trace.
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

            foreach (var quantifier in group.Quantifiers)
            {
                var q = EvaluateQuantifier(quantifier, context);
                result = isAnd ? (result && q) : (result || q);
            }

            foreach (var nested in group.Groups)
            {
                var g = Evaluate(nested, context);
                result = isAnd ? (result && g) : (result || g);
            }

            if (group.Negate) result = !result;
            var childCount = group.Conditions.Count + group.Quantifiers.Count + group.Groups.Count;
            context.Trace.Add("group", $"{(group.Negate ? "NOT " : string.Empty)}{group.Op.ToUpperInvariant()} of {childCount}", result);
            return result;
        }

        /// <summary>Symbol a scalar element binds to, since a scalar has no fields of its own.</summary>
        private const string ScalarElementSymbol = "item";

        private bool EvaluateQuantifier(PcrmQuantifier quantifier, RuleExecutionContext context)
        {
            context.TryResolve(quantifier.Collection, out var source);
            var isCollection = RuntimeValue.IsCollection(source);
            var elements = RuntimeValue.AsCollection(source).ToList();
            var kind = quantifier.Kind?.Trim().ToLowerInvariant() ?? "some";

            var outcome = elements.Count == 0
                ? SatisfiedByEmptyCollection(kind)
                : Quantify(kind, elements, quantifier.Where, context);

            var over = isCollection
                ? $"{elements.Count} element(s) of '{quantifier.Collection}'"
                : $"'{quantifier.Collection}' — not a collection, treated as empty";
            context.Trace.Add("quantifier", $"{kind.ToUpperInvariant()} over {over}", outcome);
            return outcome;
        }

        /// <summary>
        /// Empty-collection semantics, chosen deliberately rather than inherited (ADR-16 §5).
        /// ALL over an empty collection is TRUE — vacuous truth, because no element violates the
        /// predicate. This diverges from JsonLogic, which returns false there. The reason is that
        /// returning false conflates two separate questions — "do all elements satisfy P?" and
        /// "are there any elements?" — and a rule that needs the second can ask it directly with a
        /// count condition. NONE over empty is true for the same reason; SOME is false because
        /// nothing satisfies it.
        /// </summary>
        private static bool SatisfiedByEmptyCollection(string kind) => kind != "some";

        private bool Quantify(string kind, IReadOnlyList<object?> elements, PcrmGroup where, RuleExecutionContext context)
        {
            foreach (var element in elements)
            {
                var satisfied = EvaluateElement(element, where, context);
                if (kind == "some" && satisfied) return true;
                if (kind == "all" && !satisfied) return false;
                if (kind == "none" && satisfied) return false;
            }
            return kind != "some";
        }

        /// <summary>
        /// Evaluate the body with the element in scope. A record element exposes its fields by
        /// bare name; a scalar has none, so it binds to <see cref="ScalarElementSymbol"/>.
        /// </summary>
        private bool EvaluateElement(object? element, PcrmGroup where, RuleExecutionContext context)
        {
            var scope = element as IReadOnlyDictionary<string, object?>
                        ?? new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { [ScalarElementSymbol] = element };

            context.PushElementScope(scope);
            try { return Evaluate(where, context); }
            finally { context.PopElementScope(); }
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
