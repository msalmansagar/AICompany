using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Evaluation;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Crm.Retrieval
{
    /// <summary>
    /// Translates a retrieval's <see cref="PcrmGroup"/> filter into a Dataverse
    /// <see cref="FilterExpression"/> (FR-F10, FR-F11).
    ///
    /// The filter is pushed to the server rather than applied in memory, which is the entire
    /// point of FR-F11 making it mandatory: an unfiltered read that filters afterwards has
    /// already done the damage.
    ///
    /// Anything that cannot be translated FAITHFULLY is rejected rather than approximated. A
    /// filter that quietly means something else than the author wrote is the worst outcome
    /// available here — it produces a plausible population and a wrong decision.
    /// </summary>
    public static class RetrievalFilterTranslator
    {
        public static FilterExpression Translate(PcrmGroup group, RuleExecutionContext context)
        {
            if (group == null) throw new ArgumentNullException(nameof(group));
            if (context == null) throw new ArgumentNullException(nameof(context));

            // Dataverse FilterExpression has no NOT. De Morgan-ing it is possible but changes the
            // author's structure, so a negated filter is refused rather than silently rewritten.
            if (group.Negate)
                throw new NotSupportedException("A retrieval filter cannot be negated. Express the negation in the conditions themselves.");

            var filter = new FilterExpression(IsOr(group) ? LogicalOperator.Or : LogicalOperator.And);

            foreach (var condition in group.Conditions)
                filter.Conditions.Add(TranslateCondition(condition, context));

            foreach (var nested in group.Groups)
                filter.Filters.Add(Translate(nested, context));

            return filter;
        }

        private static bool IsOr(PcrmGroup group)
            => string.Equals(group.Op?.Trim(), "or", StringComparison.OrdinalIgnoreCase);

        private static ConditionExpression TranslateCondition(PcrmCondition condition, RuleExecutionContext context)
        {
            if (string.IsNullOrWhiteSpace(condition.Field))
                throw new NotSupportedException("A retrieval filter condition must name a field.");

            var value = ConditionEvaluator.ResolveOperand(condition.ValueField, condition.Value, context);
            var normalized = Normalize(condition.Operator);

            // A null right operand only has a faithful meaning for equality, where it becomes a
            // null test. Anything else compared against null would silently match nothing.
            if (value == null && normalized != "isnull" && normalized != "isnotnull")
            {
                if (normalized == "equals") return new ConditionExpression(condition.Field, ConditionOperator.Null);
                if (normalized == "notequals") return new ConditionExpression(condition.Field, ConditionOperator.NotNull);
                throw new NotSupportedException($"Operator '{condition.Operator}' cannot be translated with a null value on field '{condition.Field}'.");
            }

            if (normalized == "between")
                return Between(condition, context, value);

            return new ConditionExpression(condition.Field, MapOperator(normalized, condition.Field), ToQueryValue(value));
        }

        private static ConditionExpression Between(PcrmCondition condition, RuleExecutionContext context, object? lower)
        {
            var upper = ConditionEvaluator.ResolveOperand(condition.Value2Field, condition.Value2, context);
            if (upper == null)
                throw new NotSupportedException($"Between on '{condition.Field}' needs an upper bound.");

            return new ConditionExpression(condition.Field, ConditionOperator.Between,
                new[] { ToQueryValue(lower), ToQueryValue(upper) });
        }

        private static string Normalize(string op)
            => (op ?? string.Empty).Replace("_", string.Empty).Replace(" ", string.Empty).ToLowerInvariant();

        private static readonly Dictionary<string, ConditionOperator> Supported =
            new Dictionary<string, ConditionOperator>(StringComparer.Ordinal)
            {
                ["equals"] = ConditionOperator.Equal,
                ["notequals"] = ConditionOperator.NotEqual,
                ["greaterthan"] = ConditionOperator.GreaterThan,
                ["greaterthanorequal"] = ConditionOperator.GreaterEqual,
                ["lessthan"] = ConditionOperator.LessThan,
                ["lessthanorequal"] = ConditionOperator.LessEqual,
                ["startswith"] = ConditionOperator.BeginsWith,
                ["endswith"] = ConditionOperator.EndsWith,
                ["in"] = ConditionOperator.In,
                ["notin"] = ConditionOperator.NotIn,
                ["isnull"] = ConditionOperator.Null,
                ["isnotnull"] = ConditionOperator.NotNull,
                ["before"] = ConditionOperator.LessThan,
                ["after"] = ConditionOperator.GreaterThan,
                ["on"] = ConditionOperator.On,
                ["onorbefore"] = ConditionOperator.OnOrBefore,
                ["onorafter"] = ConditionOperator.OnOrAfter,
            };

        private static ConditionOperator MapOperator(string normalized, string field)
        {
            if (Supported.TryGetValue(normalized, out var mapped)) return mapped;

            // Deliberately absent: Contains/NotContains (server semantics differ from the
            // in-memory operator), and IsEmpty/IsNotEmpty (Dataverse cannot distinguish an empty
            // string from null in a query). Rejected rather than approximated.
            throw new NotSupportedException($"Operator '{normalized}' is not supported in a retrieval filter (field '{field}').");
        }

        /// <summary>Runtime values are decimal/DateTime/bool/string; Dataverse takes those directly.</summary>
        private static object ToQueryValue(object? value)
        {
            if (value == null) throw new NotSupportedException("A retrieval filter value resolved to null.");
            if (value is DateTime dt) return dt.ToUniversalTime();
            if (RuntimeValue.IsCollection(value)) return new List<object?>(RuntimeValue.AsCollection(value)).ToArray();
            return value;
        }
    }
}
