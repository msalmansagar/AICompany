using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.DecisionTable
{
    /// <summary>
    /// Executes a decision table under one of four hit policies (Strategy pattern):
    /// First, Unique, Priority (single winning row) and All (accumulated rows). A
    /// default row supplies outputs when nothing else matches. Each cell is a unary
    /// test (operator + value) against its column input; a wildcard cell matches anything.
    /// </summary>
    public sealed class DecisionTableEngine
    {
        public (bool matched, Dictionary<string, object?> outputs) Execute(PcrmLogic table, RuleExecutionContext context)
        {
            var matches = new List<PcrmTableRow>();
            foreach (var row in table.Rows)
            {
                if (RowMatches(table, row, context))
                {
                    context.Trace.Add("tableRow", $"row priority={row.Priority}", true);
                    matches.Add(row);
                }
            }

            var policy = table.HitPolicy.ToLowerInvariant();

            if (matches.Count == 0)
            {
                if (table.DefaultRow != null)
                {
                    context.Trace.Add("tableDefault", "default row applied", true);
                    return (true, ToOutputs(table.DefaultRow));
                }
                return (false, new Dictionary<string, object?>());
            }

            switch (policy)
            {
                case "first":
                    return (true, ToOutputs(matches[0]));
                case "priority":
                    return (true, ToOutputs(matches.OrderByDescending(r => r.Priority).First()));
                case "unique":
                    if (matches.Count > 1)
                        throw new RuleExecutionException($"Unique hit policy matched {matches.Count} rows.");
                    return (true, ToOutputs(matches[0]));
                case "all":
                    return (true, MergeAll(matches, table.OutputColumns));
                default:
                    throw new RuleExecutionException($"Unsupported hit policy '{table.HitPolicy}'.");
            }
        }

        private bool RowMatches(PcrmLogic table, PcrmTableRow row, RuleExecutionContext context)
        {
            for (var i = 0; i < table.TableInputs.Count; i++)
            {
                if (i >= row.Cells.Count) return false;
                var cell = row.Cells[i];
                if (cell.Any) continue;

                context.TryResolve(table.TableInputs[i].Field, out var left);
                var right = Evaluation.ConditionEvaluator.ResolveOperand(cell.ValueField, cell.Value, context);
                var right2 = Evaluation.ConditionEvaluator.HasOperand(cell.Value2Field, cell.Value2)
                    ? Evaluation.ConditionEvaluator.ResolveOperand(cell.Value2Field, cell.Value2, context)
                    : null;
                if (!OperatorEvaluator.Evaluate(cell.Operator, left, right, right2))
                    return false;
            }
            return true;
        }

        private static Dictionary<string, object?> ToOutputs(PcrmTableRow row)
            => row.Outputs.ToDictionary(kv => kv.Key, kv => RuntimeValue.FromJson(kv.Value));

        private static Dictionary<string, object?> MergeAll(List<PcrmTableRow> rows, List<string> columns)
        {
            // All-matches: each output column collects the list of values across matched rows.
            var result = new Dictionary<string, object?>();
            foreach (var col in columns)
            {
                var values = rows
                    .Where(r => r.Outputs.ContainsKey(col))
                    .Select(r => RuntimeValue.FromJson(r.Outputs[col]))
                    .ToList();
                result[col] = values;
            }
            return result;
        }
    }
}
