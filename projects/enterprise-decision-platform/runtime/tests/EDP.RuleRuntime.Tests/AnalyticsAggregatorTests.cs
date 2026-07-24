using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Analytics;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class AnalyticsAggregatorTests
    {
        private static readonly DateTime To = new DateTime(2026, 7, 10, 12, 0, 0, DateTimeKind.Utc);
        private static readonly DateTime From = To.AddDays(-6); // a 7-day window (inclusive)

        private static LogEntry Log(string outcome, long ms, DateTime on, string version = "v1")
            => new LogEntry { Outcome = outcome, DurationMs = ms, ExecutedOnUtc = on, VersionKey = version };

        [Fact]
        public void Counts_and_rates_reflect_the_outcome_mix()
        {
            var rows = new[]
            {
                Log("matched", 10, To), Log("matched", 20, To), Log("no-match", 30, To), Log("error", 40, To),
            };
            var s = AnalyticsAggregator.Aggregate(rows, From, To);
            Assert.Equal(4, s.Total);
            Assert.Equal(2, s.Matched);
            Assert.Equal(1, s.NoMatch);
            Assert.Equal(1, s.Error);
            Assert.Equal(0.5, s.MatchRate);
            Assert.Equal(0.25, s.ErrorRate);
        }

        [Fact]
        public void Latency_reports_average_percentiles_and_max()
        {
            var durations = new long[] { 10, 20, 30, 40, 50, 60, 70, 80, 90, 100 };
            var rows = durations.Select(d => Log("matched", d, To)).ToArray();
            var s = AnalyticsAggregator.Aggregate(rows, From, To);
            Assert.Equal(55, s.Latency.AvgMs);
            Assert.Equal(50, s.Latency.P50Ms);  // nearest-rank: ceil(.50*10)=5 → 5th value
            Assert.Equal(100, s.Latency.P95Ms); // ceil(.95*10)=10 → 10th value
            Assert.Equal(100, s.Latency.MaxMs);
        }

        [Fact]
        public void By_day_is_a_continuous_zero_filled_series_across_the_window()
        {
            var rows = new[] { Log("matched", 5, To), Log("error", 5, To), Log("matched", 5, From) };
            var s = AnalyticsAggregator.Aggregate(rows, From, To);
            Assert.Equal(7, s.ByDay.Count); // one bucket per day, gaps included
            Assert.Equal(1, s.ByDay.First().Count);              // the From day
            Assert.Equal(2, s.ByDay.Last().Count);               // the To day
            Assert.Equal(1, s.ByDay.Last().Errors);
            Assert.Equal(0, s.ByDay[3].Count);                   // a mid-window gap stays zero
        }

        [Fact]
        public void Top_versions_are_ranked_by_volume()
        {
            var rows = new List<LogEntry>();
            rows.AddRange(Enumerable.Range(0, 5).Select(_ => Log("matched", 1, To, "busy")));
            rows.AddRange(Enumerable.Range(0, 2).Select(_ => Log("matched", 1, To, "quiet")));
            var s = AnalyticsAggregator.Aggregate(rows, From, To);
            Assert.Equal("busy", s.TopVersions[0].VersionKey);
            Assert.Equal(5, s.TopVersions[0].Count);
            Assert.Equal("quiet", s.TopVersions[1].VersionKey);
        }

        [Fact]
        public void An_empty_window_produces_zeros_without_throwing()
        {
            var s = AnalyticsAggregator.Aggregate(Array.Empty<LogEntry>(), From, To);
            Assert.Equal(0, s.Total);
            Assert.Equal(0, s.MatchRate);
            Assert.Equal(0, s.Latency.P95Ms);
            Assert.Equal(7, s.ByDay.Count); // the series still spans the window
            Assert.Empty(s.TopVersions);
        }
    }
}
