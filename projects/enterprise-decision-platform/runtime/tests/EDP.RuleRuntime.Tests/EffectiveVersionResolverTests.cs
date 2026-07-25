using System;
using EDP.RuleRuntime.Versioning;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    public class EffectiveVersionResolverTests
    {
        private static DateTime Utc(int y, int m, int d) => new DateTime(y, m, d, 0, 0, 0, DateTimeKind.Utc);

        private static VersionCandidate V(int number, DateTime? from, DateTime? to)
            => new VersionCandidate { VersionId = Guid.NewGuid(), VersionNumber = number, EffectiveFrom = from, EffectiveTo = to };

        [Fact]
        public void A_null_window_is_always_effective()
        {
            var v = V(1, null, null);
            Assert.Same(v, EffectiveVersionResolver.Resolve(new[] { v }, Utc(2026, 7, 11)));
        }

        [Fact]
        public void The_future_dated_version_is_not_selected_before_its_window_opens()
        {
            var current = V(1, null, null);
            var future = V(2, Utc(2026, 8, 1), null);
            Assert.Equal(current.VersionId, EffectiveVersionResolver.Resolve(new[] { current, future }, Utc(2026, 7, 11))!.VersionId);
        }

        [Fact]
        public void The_future_dated_version_supersedes_once_its_window_opens()
        {
            var current = V(1, null, null);
            var future = V(2, Utc(2026, 8, 1), null);
            // On/after the start, the later-starting version wins.
            Assert.Equal(future.VersionId, EffectiveVersionResolver.Resolve(new[] { current, future }, Utc(2026, 8, 1))!.VersionId);
        }

        [Fact]
        public void The_upper_bound_is_exclusive()
        {
            var v = V(1, Utc(2026, 7, 1), Utc(2026, 8, 1));
            Assert.NotNull(EffectiveVersionResolver.Resolve(new[] { v }, Utc(2026, 7, 31)));
            Assert.Null(EffectiveVersionResolver.Resolve(new[] { v }, Utc(2026, 8, 1))); // exactly the end = expired
        }

        [Fact]
        public void Nothing_effective_returns_null()
        {
            var onlyFuture = V(1, Utc(2027, 1, 1), null);
            Assert.Null(EffectiveVersionResolver.Resolve(new[] { onlyFuture }, Utc(2026, 7, 11)));
        }

        [Fact]
        public void Overlapping_windows_resolve_deterministically_to_the_latest_start()
        {
            var a = V(1, Utc(2026, 1, 1), null);
            var b = V(2, Utc(2026, 6, 1), null); // later start, both open now
            Assert.Equal(b.VersionId, EffectiveVersionResolver.Resolve(new[] { a, b }, Utc(2026, 7, 11))!.VersionId);
        }
    }
}
