using System.Collections.Generic;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Retrieval
{
    /// <summary>
    /// Collapses a population to one element per key (FR-F14) — latest, earliest, highest or
    /// lowest by a chosen field.
    ///
    /// Pure and deterministic: no data access, no clock. The adapter fetches; this decides which
    /// record wins. Determinism matters more here than it looks, because FR-F31 requires a
    /// decision replayed from its snapshot to reproduce the original verdict exactly — a group
    /// selection that picked differently on a tie would break replay.
    /// </summary>
    public static class GroupSelector
    {
        /// <summary>
        /// One element per distinct key, in first-seen key order. Ties are resolved by keeping the
        /// element encountered FIRST — stable, so the same input always yields the same winner.
        /// Elements missing the key field are dropped; elements missing the ordering field lose to
        /// any element that has one.
        /// </summary>
        public static IReadOnlyList<object?> SelectPerKey(IEnumerable<object?> elements, PcrmGroupByArgMax spec)
        {
            var winners = new Dictionary<string, object?>();
            var keyOrder = new List<string>();
            var preferHigher = PrefersHigher(spec.Select);

            foreach (var element in elements)
            {
                if (!TryReadField(element, spec.Key, out var keyValue)) continue;
                var key = RuntimeValue.AsString(keyValue);

                if (!winners.ContainsKey(key)) { winners[key] = element; keyOrder.Add(key); continue; }
                if (Beats(element, winners[key], spec.By, preferHigher)) winners[key] = element;
            }

            var selected = new List<object?>(keyOrder.Count);
            foreach (var key in keyOrder) selected.Add(winners[key]);
            return selected;
        }

        /// <summary>"latest" and "highest" take the greater value; "earliest" and "lowest" the lesser.</summary>
        private static bool PrefersHigher(string select)
        {
            var mode = select?.Trim().ToLowerInvariant();
            return mode != "earliest" && mode != "lowest";
        }

        /// <summary>
        /// Strictly better, never merely equal — an equal candidate must not displace the incumbent,
        /// which is what makes the tie-break stable.
        /// </summary>
        private static bool Beats(object? candidate, object? incumbent, string orderField, bool preferHigher)
        {
            var hasCandidate = TryReadField(candidate, orderField, out var candidateValue);
            var hasIncumbent = TryReadField(incumbent, orderField, out var incumbentValue);

            if (!hasCandidate) return false;
            if (!hasIncumbent) return true;

            var comparison = RuntimeValue.Compare(candidateValue, incumbentValue);
            if (!comparison.HasValue) return false;
            return preferHigher ? comparison.Value > 0 : comparison.Value < 0;
        }

        private static bool TryReadField(object? element, string field, out object? value)
        {
            value = null;
            if (string.IsNullOrWhiteSpace(field)) return false;
            if (!(element is IReadOnlyDictionary<string, object?> record)) return false;
            return record.TryGetValue(field, out value);
        }
    }
}
