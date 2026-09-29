using System.Collections.Generic;
using System.Linq;

namespace EDP.RuleRuntime.Execution
{
    /// <summary>
    /// What happened to one evaluation (ADR-19). Callers branch on this; <see cref="RuleResult.Success"/>
    /// and <see cref="RuleResult.Matched"/> are derived from it and kept for compatibility.
    /// </summary>
    public enum RuleOutcome
    {
        /// <summary>The rule evaluated and matched.</summary>
        Matched,
        /// <summary>The rule evaluated and did not match — a business result.</summary>
        NoMatch,
        /// <summary>A well-formed request whose input failed the rule's strict contract (EDP060–063).</summary>
        InputRejected,
        /// <summary>The engine failed while evaluating.</summary>
        EngineError,
    }

    /// <summary>
    /// The outcome of one evaluation. Result-pattern: failures carry diagnostics rather than
    /// throwing across the boundary or returning null. Constructed only through the factories,
    /// so Outcome, Success and Matched can never disagree.
    /// </summary>
    public sealed class RuleResult
    {
        private RuleResult(RuleOutcome outcome, IReadOnlyDictionary<string, object?> outputs,
            ExecutionTrace trace, long elapsedMs, IReadOnlyList<RuleDiagnostic> diagnostics,
            IReadOnlyList<string> reasonCodes)
        {
            Outcome = outcome;
            Outputs = outputs;
            Trace = trace;
            ElapsedMilliseconds = elapsedMs;
            Diagnostics = diagnostics;
            ReasonCodes = reasonCodes;
        }

        /// <summary>The authoritative discriminator (ADR-19 §3).</summary>
        public RuleOutcome Outcome { get; }

        /// <summary>Evaluation completed without error (MATCHED or NO_MATCH).</summary>
        public bool Success => Outcome == RuleOutcome.Matched || Outcome == RuleOutcome.NoMatch;

        /// <summary>A rule branch / table row matched and produced outputs.</summary>
        public bool Matched => Outcome == RuleOutcome.Matched;

        public IReadOnlyDictionary<string, object?> Outputs { get; }
        public ExecutionTrace Trace { get; }
        public long ElapsedMilliseconds { get; }
        public IReadOnlyList<RuleDiagnostic> Diagnostics { get; }

        /// <summary>Reason codes emitted by the winning row(s)/branch — the machine-readable "why".</summary>
        public IReadOnlyList<string> ReasonCodes { get; }

        /// <summary>The wire value of <see cref="Outcome"/>: MATCHED, NO_MATCH, INPUT_REJECTED, ENGINE_ERROR.</summary>
        public string OutcomeCode => ToWire(Outcome);

        public static RuleResult Ok(bool matched, IReadOnlyDictionary<string, object?> outputs, ExecutionTrace trace, long elapsedMs,
            IReadOnlyList<string>? reasonCodes = null)
            => new RuleResult(matched ? RuleOutcome.Matched : RuleOutcome.NoMatch, outputs, trace, elapsedMs,
                System.Array.Empty<RuleDiagnostic>(), reasonCodes ?? System.Array.Empty<string>());

        /// <summary>The engine failed while evaluating (ENGINE_ERROR).</summary>
        public static RuleResult Failure(IReadOnlyList<RuleDiagnostic> diagnostics, ExecutionTrace trace, long elapsedMs)
            => new RuleResult(RuleOutcome.EngineError, new Dictionary<string, object?>(), trace, elapsedMs, diagnostics, System.Array.Empty<string>());

        /// <summary>The input failed the rule's strict contract; nothing was evaluated (INPUT_REJECTED).</summary>
        public static RuleResult Rejected(IReadOnlyList<RuleDiagnostic> diagnostics, ExecutionTrace trace)
            => new RuleResult(RuleOutcome.InputRejected, new Dictionary<string, object?>(), trace, 0, diagnostics, System.Array.Empty<string>());

        /// <summary>The same result with non-blocking diagnostics (warnings, notices) appended.</summary>
        public RuleResult WithAdditionalDiagnostics(IReadOnlyList<RuleDiagnostic> extra)
            => extra.Count == 0 ? this : new RuleResult(Outcome, Outputs, Trace, ElapsedMilliseconds, Diagnostics.Concat(extra).ToList(), ReasonCodes);

        /// <summary>Map an outcome to its wire value.</summary>
        public static string ToWire(RuleOutcome outcome)
        {
            switch (outcome)
            {
                case RuleOutcome.Matched: return "MATCHED";
                case RuleOutcome.NoMatch: return "NO_MATCH";
                case RuleOutcome.InputRejected: return "INPUT_REJECTED";
                default: return "ENGINE_ERROR";
            }
        }
    }
}
