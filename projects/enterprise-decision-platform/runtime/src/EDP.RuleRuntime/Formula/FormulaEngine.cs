using System;
using System.Globalization;
using System.Linq;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Operators;
using NCalc;
using NCalc.Handlers;

namespace EDP.RuleRuntime.Formula
{
    /// <summary>
    /// Formula evaluation over the bounded EDP Horizon-1 grammar, built on the NCalc
    /// AST interpreter (ADR-11 / ADR-R: no LambdaCompilation, no Reflection.Emit —
    /// sandbox-safe). Symbols resolve from the execution context; Today()/Now() use the
    /// context's fixed UTC clock for replay determinism. All string ops are
    /// InvariantCulture; all dates UTC. Collection aggregates (Sum/Average) are H2 and
    /// raise a clear error rather than silently guessing scalar semantics.
    /// </summary>
    public sealed class FormulaEngine
    {
        public object? Evaluate(string formula, RuleExecutionContext context)
        {
            if (string.IsNullOrWhiteSpace(formula))
                return null;

            var expr = new Expression(formula, ExpressionOptions.NoCache);

            expr.EvaluateParameter += (name, args) =>
            {
                if (context.TryResolve(name, out var value))
                    args.Result = value;
            };

            expr.EvaluateFunction += (name, args) => HandleFunction(name, args, context);

            try
            {
                return expr.Evaluate();
            }
            catch (FormulaException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new FormulaException($"Failed to evaluate formula '{formula}': {ex.Message}", ex);
            }
        }

        private void HandleFunction(string rawName, FunctionArgs args, RuleExecutionContext ctx)
        {
            var name = rawName.ToLowerInvariant();
            if (name.StartsWith("edp_")) name = name.Substring(4);

            object? A(int i) => args.Parameters[i].Evaluate();
            string S(int i) => RuntimeValue.AsString(A(i));
            decimal D(int i) => RuntimeValue.AsDecimal(A(i)) ?? throw new FormulaException($"Argument {i + 1} of '{rawName}' is not numeric.");
            DateTime Dt(int i) => RuntimeValue.AsDate(A(i)) ?? throw new FormulaException($"Argument {i + 1} of '{rawName}' is not a date.");
            int I(int i) => (int)D(i);

            switch (name)
            {
                // ----- date -----
                case "now": args.Result = ctx.NowUtc; break;
                case "today": args.Result = ctx.NowUtc.Date; break;
                case "date": args.Result = Dt(0); break;
                case "adddays": args.Result = Dt(0).AddDays(I(1)); break;
                case "addmonths": args.Result = Dt(0).AddMonths(I(1)); break;
                case "dateadd": args.Result = AddByUnit(Dt(0), I(1), S(2)); break;
                case "datediff": args.Result = DateDiff(Dt(0), Dt(1), args.Parameters.Length > 2 ? S(2) : "day"); break;
                case "year": args.Result = (decimal)Dt(0).Year; break;
                case "month": args.Result = (decimal)Dt(0).Month; break;
                case "day": args.Result = (decimal)Dt(0).Day; break;

                // ----- string -----
                case "upper": args.Result = S(0).ToUpperInvariant(); break;
                case "lower": args.Result = S(0).ToLowerInvariant(); break;
                case "trim": args.Result = S(0).Trim(); break;
                case "length":
                case "len": args.Result = (decimal)S(0).Length; break;
                case "substring": args.Result = Substring(S(0), I(1), args.Parameters.Length > 2 ? I(2) : -1); break;
                case "replace": args.Result = S(0).Replace(S(1), S(2)); break;
                case "concat": args.Result = string.Concat(args.Parameters.Select((_, i) => S(i))); break;
                case "contains": args.Result = S(0).IndexOf(S(1), StringComparison.OrdinalIgnoreCase) >= 0; break;
                case "startswith": args.Result = S(0).StartsWith(S(1), StringComparison.OrdinalIgnoreCase); break;
                case "endswith": args.Result = S(0).EndsWith(S(1), StringComparison.OrdinalIgnoreCase); break;

                // ----- numeric (Round/Ceiling/Floor/Min/Max are NCalc built-ins; keep EDP_Round explicit) -----
                case "round": args.Result = Math.Round(D(0), args.Parameters.Length > 1 ? I(1) : 0, MidpointRounding.AwayFromZero); break;

                // ----- utility -----
                case "coalesce": args.Result = FirstNonEmpty(args); break;
                case "isempty": args.Result = RuntimeValue.IsNullOrEmpty(A(0)); break;
                case "isnumeric": args.Result = RuntimeValue.AsDecimal(A(0)).HasValue; break;
                case "tonumber": args.Result = RuntimeValue.AsDecimal(A(0)); break;
                case "tostring": args.Result = S(0); break;

                // ----- Horizon-2 (collection aggregates) — faithful to the spike: not in H1 grammar -----
                case "sum":
                case "average":
                    throw new FormulaException($"'{rawName}' (collection aggregate) is not available in Horizon 1.");
            }
        }

        private static object FirstNonEmpty(FunctionArgs args)
        {
            for (var i = 0; i < args.Parameters.Length; i++)
            {
                var v = args.Parameters[i].Evaluate();
                if (!RuntimeValue.IsNullOrEmpty(v)) return v!;
            }
            return string.Empty;
        }

        private static string Substring(string s, int start, int length)
        {
            if (start < 0 || start > s.Length) return string.Empty;
            if (length < 0 || start + length > s.Length) return s.Substring(start);
            return s.Substring(start, length);
        }

        private static DateTime AddByUnit(DateTime d, int n, string unit)
        {
            switch (unit.ToLowerInvariant())
            {
                case "day": case "days": case "d": return d.AddDays(n);
                case "month": case "months": case "m": return d.AddMonths(n);
                case "year": case "years": case "y": return d.AddYears(n);
                default: throw new FormulaException($"Unsupported DateAdd unit '{unit}'.");
            }
        }

        private static decimal DateDiff(DateTime a, DateTime b, string unit)
        {
            var span = b - a;
            switch (unit.ToLowerInvariant())
            {
                case "day": case "days": case "d": return (decimal)Math.Floor(span.TotalDays);
                // documented month/year approximation (30.4375 days/month) per EDP-H1 determinism notes
                case "month": case "months": case "m": return Math.Floor((decimal)(span.TotalDays / 30.4375));
                case "year": case "years": case "y": return Math.Floor((decimal)(span.TotalDays / 365.25));
                default: throw new FormulaException($"Unsupported DateDiff unit '{unit}'.");
            }
        }
    }
}
