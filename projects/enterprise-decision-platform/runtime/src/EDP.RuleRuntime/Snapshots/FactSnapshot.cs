using System;
using System.Collections.Generic;

namespace EDP.RuleRuntime.Snapshots
{
    /// <summary>
    /// Everything a decision saw, captured with it (FR-F30).
    ///
    /// This is what keeps the evaluator a pure function once fact assembly can reach live data.
    /// Without it, re-running a rule tomorrow reads a different population and may reach a
    /// different verdict — correctly, and uselessly. With it, simulation, saved scenarios, replay
    /// and grounded explanation all survive, and those four are the whole governance case.
    ///
    /// Immutable by construction: the captured inputs are copied, not referenced, so a caller
    /// mutating its dictionary afterwards cannot rewrite history.
    /// </summary>
    public sealed class FactSnapshot
    {
        private FactSnapshot(IReadOnlyDictionary<string, object?> inputs, DateTime capturedAtUtc, string digest)
        {
            Inputs = inputs;
            CapturedAtUtc = capturedAtUtc;
            Digest = digest;
        }

        /// <summary>The exact input set the decision was evaluated against.</summary>
        public IReadOnlyDictionary<string, object?> Inputs { get; }

        /// <summary>
        /// The evaluation clock. Replay must reuse it, or a rule using Today() would drift even
        /// with identical facts.
        /// </summary>
        public DateTime CapturedAtUtc { get; }

        /// <summary>
        /// Tamper-evident digest of the fact set (FR-F34). Small enough to keep permanently, so a
        /// decision stays provable after the full snapshot is purged.
        /// </summary>
        public string Digest { get; }

        public static FactSnapshot Capture(IDictionary<string, object?> inputs, DateTime nowUtc)
        {
            if (inputs == null) throw new ArgumentNullException(nameof(inputs));

            var copied = new Dictionary<string, object?>(inputs, StringComparer.OrdinalIgnoreCase);
            var capturedAt = nowUtc.ToUniversalTime();
            return new FactSnapshot(copied, capturedAt, SnapshotDigest.Compute(copied, capturedAt));
        }

        /// <summary>
        /// Rebuild a snapshot from stored facts — the replay path. The digest is recomputed rather
        /// than trusted, so a fact set altered in storage no longer matches what was recorded.
        /// </summary>
        public static FactSnapshot Restore(IDictionary<string, object?> inputs, DateTime capturedAtUtc)
            => Capture(inputs, capturedAtUtc);

        /// <summary>True when this snapshot holds the same facts as the one recorded.</summary>
        public bool MatchesDigest(string recordedDigest)
            => string.Equals(Digest, recordedDigest, StringComparison.Ordinal);
    }
}
