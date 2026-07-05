using System.Collections.Generic;

namespace EDP.RuleRuntime.Execution
{
    /// <summary>
    /// The outcome of one evaluation. Result-pattern: Success indicates whether a
    /// decision was produced; failures carry diagnostics rather than throwing across
    /// the boundary or returning null.
    /// </summary>
    public sealed class RuleResult
    {
        private RuleResult(bool success, bool matched, IReadOnlyDictionary<string, object?> outputs,
            ExecutionTrace trace, long elapsedMs, IReadOnlyList<RuleDiagnostic> diagnostics)
        {
            Success = success;
            Matched = matched;
            Outputs = outputs;
            Trace = trace;
            ElapsedMilliseconds = elapsedMs;
            Diagnostics = diagnostics;
        }

        /// <summary>Evaluation completed without error.</summary>
        public bool Success { get; }

        /// <summary>A rule branch / table row matched and produced outputs.</summary>
        public bool Matched { get; }

        public IReadOnlyDictionary<string, object?> Outputs { get; }
        public ExecutionTrace Trace { get; }
        public long ElapsedMilliseconds { get; }
        public IReadOnlyList<RuleDiagnostic> Diagnostics { get; }

        public static RuleResult Ok(bool matched, IReadOnlyDictionary<string, object?> outputs, ExecutionTrace trace, long elapsedMs)
            => new RuleResult(true, matched, outputs, trace, elapsedMs, System.Array.Empty<RuleDiagnostic>());

        public static RuleResult Failure(IReadOnlyList<RuleDiagnostic> diagnostics, ExecutionTrace trace, long elapsedMs)
            => new RuleResult(false, false, new Dictionary<string, object?>(), trace, elapsedMs, diagnostics);
    }
}
