using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Hashing;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// ADR-20 ContentHash. The shared vectors in contract/content-hash-vectors.json are the
    /// cross-implementation proof: the TypeScript SDK runs the same file and must agree byte for byte.
    /// </summary>
    public class ContentHashTests
    {
        public static IEnumerable<object[]> Vectors()
        {
            var path = Path.Combine(AppContext.BaseDirectory, "contract", "content-hash-vectors.json");
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            return document.RootElement.GetProperty("vectors").EnumerateArray()
                .Select(v => new object[] { v.GetProperty("id").GetString()!, v.GetProperty("pcrm").GetString()!,
                    v.GetProperty("canonical").GetString()!, v.GetProperty("sha256").GetString()! })
                .ToList();
        }

        /// <summary>(vector pcrm, related vector pcrm) pairs for one relation name in the shared file.</summary>
        private static List<(string Pcrm, string RelatedPcrm)> Related(string relation)
        {
            var path = Path.Combine(AppContext.BaseDirectory, "contract", "content-hash-vectors.json");
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var vectors = document.RootElement.GetProperty("vectors").EnumerateArray().ToList();
            var pcrmById = vectors.ToDictionary(v => v.GetProperty("id").GetString()!, v => v.GetProperty("pcrm").GetString()!);
            return vectors.Where(v => v.TryGetProperty(relation, out _))
                .Select(v => (v.GetProperty("pcrm").GetString()!, pcrmById[v.GetProperty(relation).GetString()!]))
                .ToList();
        }

        [Fact]
        public void Vectors_AreAtLeastFive()
            => Assert.True(Vectors().Count() >= 5);

        [Fact]
        public void Compute_ReorderedVector_HashesIdenticallyToItsOriginal()
        {
            var pairs = Related("sameHashAs");
            Assert.NotEmpty(pairs);
            Assert.All(pairs, pair => Assert.Equal(ContentHash.Compute(pair.RelatedPcrm), ContentHash.Compute(pair.Pcrm)));
        }

        [Fact]
        public void Compute_StrictAndLenientVariants_HashDifferently()
        {
            var pairs = Related("differentHashFrom");
            Assert.NotEmpty(pairs);
            Assert.All(pairs, pair => Assert.NotEqual(ContentHash.Compute(pair.RelatedPcrm), ContentHash.Compute(pair.Pcrm)));
        }

        [Theory]
        [MemberData(nameof(Vectors))]
        public void Canonicalize_SharedVector_ProducesPublishedCanonicalText(string id, string pcrm, string canonical, string sha256)
        {
            _ = id; _ = sha256;
            Assert.Equal(canonical, ContentHash.Canonicalize(pcrm));
        }

        [Theory]
        [MemberData(nameof(Vectors))]
        public void Compute_SharedVector_ProducesPublishedHash(string id, string pcrm, string canonical, string sha256)
        {
            _ = id; _ = canonical;
            Assert.Equal(sha256, ContentHash.Compute(pcrm));
        }

        [Fact]
        public void Compute_MetadataOnlyChanges_DoNotChangeTheHash()
        {
            var before = ContentHash.Compute("""{"name":"A","ruleId":"1","schemaVersion":"1.0","x-layout":{"x":1},"logic":{"type":"conditionSet"}}""");
            var after = ContentHash.Compute("""{"name":"B","ruleId":"2","schemaVersion":"1.1","description":"new","logic":{"type":"conditionSet"}}""");
            Assert.Equal(before, after);
        }

        [Fact]
        public void Compute_ExecutableChange_ChangesTheHash()
        {
            var before = ContentHash.Compute("""{"logic":{"type":"conditionSet","otherwise":{"tier":"A"}}}""");
            var after = ContentHash.Compute("""{"logic":{"type":"conditionSet","otherwise":{"tier":"B"}}}""");
            Assert.NotEqual(before, after);
        }

        [Fact]
        public void Compute_NestedNameProperty_IsNotExcluded()
        {
            var withTier = ContentHash.Compute("""{"inputs":[{"name":"tier"}]}""");
            var withBand = ContentHash.Compute("""{"inputs":[{"name":"band"}]}""");
            Assert.NotEqual(withTier, withBand);
        }

        [Fact]
        public void Compute_DuplicateKey_Throws()
            => Assert.Throws<FormatException>(() => ContentHash.Compute("""{"logic":{"a":1,"a":2}}"""));

        [Fact]
        public void Compute_NonObjectRoot_Throws()
            => Assert.Throws<FormatException>(() => ContentHash.Compute("[1,2]"));

        [Fact]
        public void Compute_ExponentBeyondLimit_Throws()
            => Assert.Throws<FormatException>(() => ContentHash.Compute("""{"logic":{"v":1e1001}}"""));

        [Fact]
        public void Compute_IsLowerCaseHexOf64Characters()
            => Assert.Matches("^[0-9a-f]{64}$", ContentHash.Compute("{}"));
    }
}
