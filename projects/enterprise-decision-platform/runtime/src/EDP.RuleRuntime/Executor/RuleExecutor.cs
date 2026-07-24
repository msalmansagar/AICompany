using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.DecisionTable;
using EDP.RuleRuntime.Evaluation;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Formula;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Executor
{
    /// <summary>
    /// Executes a CompiledRule against a set of input values. Deterministic and
    /// stateless: one execution context per call, a fixed UTC clock, no shared mutable
    /// state. Produces outputs, an execution trace, and elapsed time.
    /// </summary>
    public sealed class RuleExecutor
    {
        private readonly FormulaEngine _formula = new FormulaEngine();
        private readonly ConditionEvaluator _conditions = new ConditionEvaluator();
        private readonly DecisionTableEngine _table = new DecisionTableEngine();

        public RuleResult Execute(CompiledRule rule, IDictionary<string, object?> inputs, DateTime? nowUtc = null)
        {
            var stopwatch = Stopwatch.StartNew();
            var context = new RuleExecutionContext(inputs, nowUtc);

            try
            {
                ComputeVariables(rule.Document, context);

                var (matched, outputs) = rule.Document.Logic.Type.Equals("decisionTable", StringComparison.OrdinalIgnoreCase)
                    ? _table.Execute(rule.Document.Logic, context)
                    : ExecuteConditionSet(rule.Document.Logic, context);

                stopwatch.Stop();
                return RuleResult.Ok(matched, outputs, context.Trace, stopwatch.ElapsedMilliseconds, context.ReasonCodes);
            }
            catch (RuleRuntimeException ex)
            {
                stopwatch.Stop();
                context.Trace.Add("error", ex.Message);
                return RuleResult.Failure(
                    new[] { new RuleDiagnostic(ex.Code, ex.Message) },
                    context.Trace, stopwatch.ElapsedMilliseconds);
            }
        }

        private void ComputeVariables(PcrmDocument doc, RuleExecutionContext context)
        {
            foreach (var variable in doc.Variables)
            {
                var value = _formula.Evaluate(variable.Formula, context);
                context.SetVariable(variable.Name, value);
                context.Trace.Add("variable", $"{variable.Name} = {RuntimeValue.AsString(value)}");
            }
        }

        private (bool matched, Dictionary<string, object?> outputs) ExecuteConditionSet(PcrmLogic logic, RuleExecutionContext context)
        {
            foreach (var rule in logic.Rules)
            {
                if (_conditions.Evaluate(rule.When, context))
                {
                    context.Trace.Add("branch", "matched THEN branch", true);
                    context.AddReasonCodes(rule.ReasonCodes);
                    return (true, rule.Then.ToDictionary(kv => kv.Key, kv => RuntimeValue.FromJson(kv.Value)));
                }
            }

            if (logic.Otherwise != null)
            {
                context.Trace.Add("branch", "matched OTHERWISE branch", true);
                return (true, logic.Otherwise.ToDictionary(kv => kv.Key, kv => RuntimeValue.FromJson(kv.Value)));
            }

            context.Trace.Add("branch", "no branch matched", false);
            return (false, new Dictionary<string, object?>());
        }
    }
}
