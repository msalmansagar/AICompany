using System;
using System.Collections.Generic;
using System.Linq;

namespace EDP.RuleRuntime.Versioning
{
    /// <summary>One Published version and its effective window (nulls = open-ended).</summary>
    public sealed class VersionCandidate
    {
        public Guid VersionId { get; set; }
        public int VersionNumber { get; set; }
        public DateTime? EffectiveFrom { get; set; }
        public DateTime? EffectiveTo { get; set; }
    }

    /// <summary>
    /// Picks the rule version effective at a given instant. Effective dating lets a version be
    /// published ahead of go-live: the window <c>[EffectiveFrom, EffectiveTo)</c> is half-open, a
    /// null <c>From</c> means "always been effective", a null <c>To</c> means "no end". Among the
    /// versions whose window contains the instant, the one with the latest start wins (ties broken
    /// by the higher version number) — so a newer future-dated version supersedes an older one the
    /// moment its window opens. Pure and CRM-free: the caller supplies the Published candidates.
    /// </summary>
    public static class EffectiveVersionResolver
    {
        public static VersionCandidate? Resolve(IEnumerable<VersionCandidate> candidates, DateTime asOfUtc)
        {
            if (candidates == null) throw new ArgumentNullException(nameof(candidates));
            return candidates
                .Where(c => IsEffective(c, asOfUtc))
                .OrderByDescending(c => c.EffectiveFrom ?? DateTime.MinValue)
                .ThenByDescending(c => c.VersionNumber)
                .FirstOrDefault();
        }

        /// <summary>True when <paramref name="asOfUtc"/> falls inside the half-open window [From, To).</summary>
        public static bool IsEffective(VersionCandidate candidate, DateTime asOfUtc)
        {
            if (candidate == null) throw new ArgumentNullException(nameof(candidate));
            if (candidate.EffectiveFrom.HasValue && asOfUtc < candidate.EffectiveFrom.Value) return false;
            if (candidate.EffectiveTo.HasValue && asOfUtc >= candidate.EffectiveTo.Value) return false;
            return true;
        }
    }
}
