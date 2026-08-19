using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Pcrm;
using EDP.RuleRuntime.Retrieval;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// EDP-FACT-001 F2 — group-by with argmax (FR-F14). The specimen's case is "the latest
    /// purchase per invoice line-item ref, by LC issuance date".
    /// </summary>
    public class GroupSelectorTests
    {
        private static object? Purchase(string lineRef, string issuedOn, decimal unitPrice)
            => new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["lineRef"] = lineRef,
                ["lcIssuedOn"] = DateTime.Parse(issuedOn, System.Globalization.CultureInfo.InvariantCulture,
                                                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal),
                ["unitPrice"] = unitPrice,
            };

        private static PcrmGroupByArgMax Spec(string select = "latest")
            => new PcrmGroupByArgMax { Key = "lineRef", By = "lcIssuedOn", Select = select };

        private static decimal PriceOf(object? element)
            => (decimal)((IReadOnlyDictionary<string, object?>)element!)["unitPrice"]!;

        [Fact]
        public void Latest_per_key_picks_the_most_recent_purchase()
        {
            var purchases = new List<object?>
            {
                Purchase("11", "2024-01-01", 100m),
                Purchase("11", "2026-05-01", 130m),   // latest for 11
                Purchase("12", "2025-03-01", 50m),
                Purchase("11", "2025-06-01", 120m),
            };

            var selected = GroupSelector.SelectPerKey(purchases, Spec());

            Assert.Equal(2, selected.Count);
            Assert.Equal(130m, PriceOf(selected[0]));
            Assert.Equal(50m, PriceOf(selected[1]));
        }

        [Fact]
        public void Earliest_per_key_picks_the_oldest()
        {
            var purchases = new List<object?> { Purchase("11", "2026-05-01", 130m), Purchase("11", "2024-01-01", 100m) };

            Assert.Equal(100m, PriceOf(GroupSelector.SelectPerKey(purchases, Spec("earliest")).Single()));
        }

        [Fact]
        public void Highest_and_lowest_order_by_value_not_by_date()
        {
            var purchases = new List<object?> { Purchase("11", "2024-01-01", 100m), Purchase("11", "2026-05-01", 130m) };
            var byPrice = new PcrmGroupByArgMax { Key = "lineRef", By = "unitPrice", Select = "highest" };
            var byPriceLow = new PcrmGroupByArgMax { Key = "lineRef", By = "unitPrice", Select = "lowest" };

            Assert.Equal(130m, PriceOf(GroupSelector.SelectPerKey(purchases, byPrice).Single()));
            Assert.Equal(100m, PriceOf(GroupSelector.SelectPerKey(purchases, byPriceLow).Single()));
        }

        [Fact]
        public void Keys_come_back_in_first_seen_order_so_the_result_is_stable()
        {
            var purchases = new List<object?> { Purchase("99", "2024-01-01", 1m), Purchase("11", "2024-01-01", 2m) };

            var keys = GroupSelector.SelectPerKey(purchases, Spec())
                .Select(e => ((IReadOnlyDictionary<string, object?>)e!)["lineRef"]).ToArray();

            Assert.Equal(new object?[] { "99", "11" }, keys);
        }

        [Fact]
        public void A_tie_keeps_the_element_seen_first()
        {
            // Stability is not cosmetic: FR-F31 requires a replayed decision to reproduce the
            // original verdict, and a tie resolved differently on replay would break that.
            var purchases = new List<object?> { Purchase("11", "2025-01-01", 100m), Purchase("11", "2025-01-01", 200m) };

            Assert.Equal(100m, PriceOf(GroupSelector.SelectPerKey(purchases, Spec()).Single()));
        }

        [Fact]
        public void An_element_missing_the_ordering_field_loses_to_one_that_has_it()
        {
            var noDate = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["lineRef"] = "11", ["unitPrice"] = 999m };
            var purchases = new List<object?> { noDate, Purchase("11", "2024-01-01", 100m) };

            Assert.Equal(100m, PriceOf(GroupSelector.SelectPerKey(purchases, Spec()).Single()));
        }

        [Fact]
        public void Elements_without_the_key_field_are_dropped()
        {
            var keyless = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase) { ["unitPrice"] = 1m };
            var purchases = new List<object?> { keyless, Purchase("11", "2024-01-01", 100m) };

            Assert.Single(GroupSelector.SelectPerKey(purchases, Spec()));
        }

        [Fact]
        public void An_empty_population_yields_nothing_rather_than_throwing()
            => Assert.Empty(GroupSelector.SelectPerKey(new List<object?>(), Spec()));
    }
}
