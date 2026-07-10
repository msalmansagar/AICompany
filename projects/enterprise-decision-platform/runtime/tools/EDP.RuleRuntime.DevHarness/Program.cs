using System.Collections.Generic;
using System.Text.Json;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Operators;

// Local browser test harness for the Native C# Rule Runtime.
// Reuses the exact RuleRuntimeService the CRM plugin uses. Dev-only.

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5099"); // stable port for the designer's Test button proxy
var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapPost("/api/evaluate", (EvaluateRequest request) =>
{
    var runtime = new RuleRuntimeService(new PermissiveMetadataResolver());

    var inputs = new Dictionary<string, object?>();
    if (request.Inputs is not null)
        foreach (var kv in request.Inputs)
            inputs[kv.Key] = RuntimeValue.FromJson(kv.Value);

    var now = DateTime.TryParse(request.NowUtc, out var parsed)
        ? parsed.ToUniversalTime()
        : DateTime.UtcNow;

    try
    {
        var result = runtime.Execute(request.Pcrm ?? "", inputs, now);
        return Results.Json(new
        {
            success = result.Success,
            matched = result.Matched,
            outputs = result.Outputs,
            elapsedMs = result.ElapsedMilliseconds,
            trace = result.Trace.Steps.Select(s => new { kind = s.Kind, description = s.Description, result = s.Result }),
            diagnostics = result.Diagnostics.Select(Map)
        });
    }
    catch (RuleCompilationException ex)
    {
        return Results.Json(new
        {
            success = false,
            matched = false,
            outputs = new Dictionary<string, object?>(),
            elapsedMs = 0,
            trace = Array.Empty<object>(),
            diagnostics = ex.Diagnostics.Select(Map)
        });
    }
    catch (Exception ex)
    {
        return Results.Json(new
        {
            success = false,
            matched = false,
            outputs = new Dictionary<string, object?>(),
            elapsedMs = 0,
            trace = Array.Empty<object>(),
            diagnostics = new[] { new { code = "harness_error", message = ex.Message, severity = "Error" } }
        });
    }

    static object Map(RuleDiagnostic d) => new { code = d.Code, message = d.Message, severity = d.Severity.ToString() };
});

app.Run();

record EvaluateRequest(string? Pcrm, Dictionary<string, JsonElement>? Inputs, string? NowUtc);

/// <summary>Ad-hoc testing resolver: treats every entity/field as present so any PCRM runs unseeded.</summary>
sealed class PermissiveMetadataResolver : IMetadataResolver
{
    public bool EntityExists(string entityLogicalName) => true;
    public bool TryGetAttribute(string entityLogicalName, string attributeLogicalName, out AttributeInfo attribute)
    {
        attribute = new AttributeInfo(attributeLogicalName, FieldType.Text);
        return true;
    }
    public IReadOnlyCollection<int> GetOptionValues(string entityLogicalName, string attributeLogicalName) => Array.Empty<int>();
}
