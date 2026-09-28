using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Replay;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// TC-3, release-blocking: every rule version captured from the org, replayed with the
    /// deterministic cases recorded against the pre-Release-1 engine, must decide exactly as it did.
    /// Regenerate the goldens only with runtime/tools/EDP.RuleRuntime.Replay against the baseline engine.
    /// </summary>
    public class ReplayRegressionTests
    {
        private static readonly string ReplayDirectory = Path.Combine(AppContext.BaseDirectory, "replay");

        private static JsonObject Load(string file) => JsonNode.Parse(File.ReadAllText(Path.Combine(ReplayDirectory, file)))!.AsObject();

        public static IEnumerable<object[]> RecordedVersions()
            => Load("replay-cases.json")["versions"]!.AsArray().Select(v => new object[] { (string)v!["ruleVersionId"]! });

        private static string PcrmOf(string ruleVersionId)
            => (string)Load("live-rule-versions.json")["versions"]!.AsArray().Single(v => (string)v!["ruleVersionId"]! == ruleVersionId)!["pcrm"]!;

        private static JsonArray CasesOf(string ruleVersionId)
            => Load("replay-cases.json")["versions"]!.AsArray().Single(v => (string)v!["ruleVersionId"]! == ruleVersionId)!["cases"]!.AsArray();

        [Fact]
        public void Goldens_CoverEveryCapturedVersion()
        {
            var captured = Load("live-rule-versions.json")["versions"]!.AsArray().Select(v => (string)v!["ruleVersionId"]!).OrderBy(id => id);
            var recorded = RecordedVersions().Select(r => (string)r[0]).OrderBy(id => id);
            Assert.Equal(captured, recorded);
        }

        [Fact]
        public void Goldens_WereRecordedFromTheBaselineCommit()
            => Assert.Equal("a4c04fd2c817a6e0b3c20cabe608d7b6bba9f6a0", (string)Load("replay-cases.json")["recordedFromCommit"]!);

        [Theory]
        [MemberData(nameof(RecordedVersions))]
        public void Replay_EveryRecordedCase_DecidesAsTheBaselineDid(string ruleVersionId)
        {
            var pcrm = PcrmOf(ruleVersionId);
            var runtime = new RuleRuntimeService(new InMemoryMetadataResolver());
            var mismatches = CasesOf(ruleVersionId)
                .Select(c => (Inputs: c!["inputs"]!.AsObject(), Expected: c["expected"]!.ToJsonString()))
                .Select(c => (c.Inputs, c.Expected, Actual: ReplayExecutor.Run(runtime, pcrm, c.Inputs).ToJsonString()))
                .Where(c => c.Expected != c.Actual)
                .Select(c => $"{c.Inputs.ToJsonString()}: expected {c.Expected} got {c.Actual}")
                .ToList();
            Assert.Empty(mismatches);
        }

        [Fact]
        public void Generator_SamePcrm_ProducesTheSameCases()
        {
            var pcrm = PcrmOf(RecordedVersions().Select(r => (string)r[0]).First());
            var first = ReplayCaseGenerator.InputSetsFor(pcrm).Select(s => s.ToJsonString());
            var second = ReplayCaseGenerator.InputSetsFor(pcrm).Select(s => s.ToJsonString());
            Assert.Equal(first, second);
        }

        [Fact]
        public void Goldens_InputsMatchWhatTheGeneratorProducesToday()
        {
            var drifted = RecordedVersions().Select(r => (string)r[0])
                .Where(id => !ReplayCaseGenerator.InputSetsFor(PcrmOf(id)).Select(s => s.ToJsonString())
                    .SequenceEqual(CasesOf(id).Select(c => c!["inputs"]!.ToJsonString())))
                .ToList();
            Assert.Empty(drifted);
        }
    }
}
