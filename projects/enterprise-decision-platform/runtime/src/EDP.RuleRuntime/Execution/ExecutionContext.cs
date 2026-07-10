using System;
using System.Collections.Generic;

namespace EDP.RuleRuntime.Execution
{
    /// <summary>
    /// Per-evaluation state: input values, resolved variables, and the fixed evaluation
    /// clock. EDP_Now is captured ONCE here (__now) so a rule replays deterministically.
    /// Stateless across evaluations — one context per decision, never shared.
    /// </summary>
    public sealed class RuleExecutionContext
    {
        private readonly Dictionary<string, object?> _inputs;
        private readonly Dictionary<string, object?> _variables =
            new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        public RuleExecutionContext(IDictionary<string, object?> inputs, DateTime? nowUtc = null)
        {
            _inputs = new Dictionary<string, object?>(inputs, StringComparer.OrdinalIgnoreCase);
            // Determinism: a single UTC clock for the whole evaluation.
            NowUtc = (nowUtc ?? DateTime.UtcNow).ToUniversalTime();
        }

        public DateTime NowUtc { get; }

        public ExecutionTrace Trace { get; } = new ExecutionTrace();

        public void SetVariable(string name, object? value) => _variables[name] = value;

        /// <summary>Resolve a symbol: variables shadow inputs (variables are derived last).</summary>
        public bool TryResolve(string name, out object? value)
        {
            if (_variables.TryGetValue(name, out value)) return true;
            if (_inputs.TryGetValue(name, out value)) return true;
            value = null;
            return false;
        }

        public IReadOnlyDictionary<string, object?> Inputs => _inputs;
        public IReadOnlyDictionary<string, object?> Variables => _variables;
    }
}
