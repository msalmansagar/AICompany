using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace EDP.RuleRuntime.Analytics
{
    /// <summary>One execution-log row reduced to the fields analytics needs.</summary>
    public sealed class LogEntry
    {
        public string Outcome { get; set; } = "";      // "matched" | "no-match" | "error"
        public long DurationMs { get; set; }
        public DateTime ExecutedOnUtc { get; set; }
        public string VersionKey { get; set; } = "";    // rule-version id, or "adhoc" for unsaved runs
    }

    public sealed class LatencyStats
    {
        public double AvgMs { get; set; }
        public long P50Ms { get; set; }
        public long P95Ms { get; set; }
        public long MaxMs { get; set; }
    }

    public sealed class DayBucket
    {
        public string Date { get; set; } = "";  // yyyy-MM-dd (UTC)
        public int Count { get; set; }
        public int Errors { get; set; }
    }

    public sealed class VersionUsage
    {
        public string VersionKey { get; set; } = "";
        public int Count { get; set; }
        public int Errors { get; set; }
    }

    public sealed class AnalyticsSummary
    {
        public int Total { get; set; }
        public int Matched { get; set; }
        public int NoMatch { get; set; }
        public int Error { get; set; }
        public double MatchRate { get; set; }
        public double ErrorRate { get; set; }
        public LatencyStats Latency { get; set; } = new LatencyStats();
        public List<DayBucket> ByDay { get; set; } = new List<DayBucket>();
        public List<VersionUsage> TopVersions { get; set; } = new List<VersionUsage>();
    }

    /// <summary>
    /// Reduces execution-log rows to dashboard metrics: volume, outcome mix, latency percentiles,
    /// a continuous per-day series, and top rule-versions by volume. Pure and CRM-free so it is
    /// directly unit-testable; the plugin supplies rows and resolves version keys to labels.
    /// </summary>
    public static class AnalyticsAggregator
    {
        private const string Matched = "matched", NoMatch = "no-match", Error = "error";

        public static AnalyticsSummary Aggregate(IEnumerable<LogEntry> entries, DateTime fromUtc, DateTime toUtc, int topVersions = 10)
        {
            if (entries == null) throw new ArgumentNullException(nameof(entries));
            var rows = entries.ToList();

            var summary = new AnalyticsSummary
            {
                Total = rows.Count,
                Matched = rows.Count(r => Is(r, Matched)),
                NoMatch = rows.Count(r => Is(r, NoMatch)),
                Error = rows.Count(r => Is(r, Error)),
            };
            summary.MatchRate = Ratio(summary.Matched, summary.Total);
            summary.ErrorRate = Ratio(summary.Error, summary.Total);
            summary.Latency = Latency(rows.Select(r => r.DurationMs).ToList());
            summary.ByDay = ByDay(rows, fromUtc, toUtc);
            summary.TopVersions = TopVersions(rows, topVersions);
            return summary;
        }

        private static bool Is(LogEntry r, string outcome) => string.Equals(r.Outcome, outcome, StringComparison.OrdinalIgnoreCase);
        private static double Ratio(int part, int whole) => whole == 0 ? 0d : Math.Round((double)part / whole, 4);

        private static LatencyStats Latency(List<long> durations)
        {
            if (durations.Count == 0) return new LatencyStats();
            durations.Sort();
            return new LatencyStats
            {
                AvgMs = Math.Round(durations.Average(), 1),
                P50Ms = Percentile(durations, 50),
                P95Ms = Percentile(durations, 95),
                MaxMs = durations[durations.Count - 1],
            };
        }

        // Nearest-rank percentile on an ascending-sorted list.
        private static long Percentile(List<long> sorted, int percentile)
        {
            var rank = (int)Math.Ceiling(percentile / 100d * sorted.Count);
            var index = Math.Min(Math.Max(rank - 1, 0), sorted.Count - 1);
            return sorted[index];
        }

        // A continuous day-by-day series across the whole window, zero-filled so charts don't gap.
        private static List<DayBucket> ByDay(List<LogEntry> rows, DateTime fromUtc, DateTime toUtc)
        {
            var counts = new Dictionary<DateTime, DayBucket>();
            for (var day = fromUtc.Date; day <= toUtc.Date; day = day.AddDays(1))
                counts[day] = new DayBucket { Date = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) };

            foreach (var r in rows)
            {
                if (!counts.TryGetValue(r.ExecutedOnUtc.Date, out var bucket)) continue; // outside the window
                bucket.Count++;
                if (Is(r, Error)) bucket.Errors++;
            }
            return counts.Values.OrderBy(b => b.Date, StringComparer.Ordinal).ToList();
        }

        private static List<VersionUsage> TopVersions(List<LogEntry> rows, int topVersions)
            => rows.GroupBy(r => string.IsNullOrWhiteSpace(r.VersionKey) ? "adhoc" : r.VersionKey)
                   .Select(g => new VersionUsage { VersionKey = g.Key, Count = g.Count(), Errors = g.Count(r => Is(r, Error)) })
                   .OrderByDescending(v => v.Count).ThenBy(v => v.VersionKey, StringComparer.Ordinal)
                   .Take(topVersions).ToList();
    }
}
