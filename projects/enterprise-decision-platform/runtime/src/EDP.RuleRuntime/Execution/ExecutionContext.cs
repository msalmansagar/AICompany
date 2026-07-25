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

        private readonly List<string> _reasonCodes = new List<string>();
        private readonly HashSet<string> _seenReasonCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        /// <summary>Reason codes emitted by the winning row(s)/branch, in order and de-duplicated.</summary>
        public IReadOnlyList<string> ReasonCodes => _reasonCodes;

        /// <summary>Record the reason codes of a row/branch that produced the decision. Blank codes are ignored.</summary>
        public void AddReasonCodes(IEnumerable<string>? codes)
        {
            if (codes == null) return;
            foreach (var raw in codes)
            {
                var code = raw?.Trim();
                if (string.IsNullOrEmpty(code) || !_seenReasonCodes.Add(code!)) continue;
                _reasonCodes.Add(code!);
            }
        }

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
