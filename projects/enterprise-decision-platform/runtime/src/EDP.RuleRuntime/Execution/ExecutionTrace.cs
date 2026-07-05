using System.Collections.Generic;

namespace EDP.RuleRuntime.Execution
{
    /// <summary>One recorded step in an evaluation (a condition, group, formula, or table row).</summary>
    public sealed class TraceStep
    {
        public TraceStep(string kind, string description, bool? result)
        {
            Kind = kind;
            Description = description;
            Result = result;
        }

        public string Kind { get; }
        public string Description { get; }
        public bool? Result { get; }

        public override string ToString()
            => Result.HasValue ? $"{Kind}: {Description} => {Result.Value}" : $"{Kind}: {Description}";
    }

    /// <summary>
    /// Ordered execution trace. Per ADR-13 this is high-volume telemetry: it is captured
    /// in-memory during evaluation and handed to the trace sink AFTER the decision is
    /// returned — trace persistence must never block or fail a decision.
    /// </summary>
    public sealed class ExecutionTrace
    {
        private readonly List<TraceStep> _steps = new List<TraceStep>();
        public IReadOnlyList<TraceStep> Steps => _steps;

        public void Add(string kind, string description, bool? result = null)
            => _steps.Add(new TraceStep(kind, description, result));
    }
}
