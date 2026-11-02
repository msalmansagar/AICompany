using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Replay;

// TC-3 replay harness.
//   record  <fixtures.json> <cases.json>   generate deterministic cases and record what THIS engine decides
// Run "record" against the baseline engine to produce the goldens; the CI test
// (ReplayRegressionTests) replays the same cases on the current engine and compares.
if (args.Length != 3 || args[0] != "record")
{
    Console.Error.WriteLine("usage: record <fixtures.json> <cases.json>");
    return 2;
}

var fixtures = JsonNode.Parse(File.ReadAllText(args[1]))!["versions"]!.AsArray();
var runtime = new RuleRuntimeService(new InMemoryMetadataResolver());
var versions = new JsonArray();
foreach (var version in fixtures.OfType<JsonObject>().Where(v => v["pcrm"] is JsonValue))
{
    var pcrm = (string)version["pcrm"]!;
    var cases = new JsonArray(ReplayCaseGenerator.InputSetsFor(pcrm)
        .Select(inputs => (JsonNode?)new JsonObject { ["inputs"] = inputs, ["expected"] = ReplayExecutor.Run(runtime, pcrm, inputs) })
        .ToArray());
    versions.Add(new JsonObject { ["ruleVersionId"] = (string)version["ruleVersionId"]!, ["cases"] = cases });
}

var document = new JsonObject
{
    ["$comment"] = "TC-3 golden results, recorded by runtime/tools/EDP.RuleRuntime.Replay against the engine named in recordedWith. Do not edit by hand.",
    ["recordedWith"] = typeof(RuleRuntimeService).Assembly.GetName().Version?.ToString(),
    ["replayNowUtc"] = ReplayExecutor.ReplayNowUtc.ToString("o"),
    ["versions"] = versions,
};
File.WriteAllText(args[2], document.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n");
Console.WriteLine($"recorded {versions.Count} versions, {versions.Sum(v => v!["cases"]!.AsArray().Count)} cases");
return 0;
