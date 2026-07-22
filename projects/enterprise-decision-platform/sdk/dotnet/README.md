# Edp.DecisionClient — EDP Decision SDK (.NET)

A typed .NET client for the [Decision Gateway](../../gateway). Per **ADR-EDS-09** it is an
**envelope builder only** — it assembles the canonical request, calls the gateway, and returns the
typed result. No decision logic, no Dataverse knowledge.

Targets **netstandard2.0**, so it's usable from .NET 8+ apps, .NET Framework services, and CRM
plugins alike.

## Usage

```csharp
using Edp.DecisionClient;

var edp = new EdpDecisionClient("https://decisions.example.com", apiKey: Environment.GetEnvironmentVariable("EDP_API_KEY"));

var result = await edp.EvaluateAsync(
    RuleRef.ByName("Account Credit Tier"),
    new Dictionary<string, object?> { ["revenue"] = 1_500_000 });

if (result.Matched)
{
    Console.WriteLine(result.Outputs["creditTier"].GetString()); // "Gold"
    Console.WriteLine(result.Outputs["discount"].GetInt32());    // 15
}
```

Errors throw `EdpDecisionException` (`.Code`, `.StatusCode`):

```csharp
try { await edp.EvaluateAsync(RuleRef.ByName("Missing")); }
catch (EdpDecisionException ex) when (ex.Code == "rule_not_found") { /* ... */ }
```

## Methods

`EvaluateAsync` · `TestAsync` · `ValidateAsync` · `EvaluateRuleSetAsync` · `GetSchemaAsync` ·
`GetHistoryAsync` · `ExplainAsync` — each takes an optional `correlationId` and `CancellationToken`.
Address a rule with `RuleRef.ByVersion(id)` / `RuleRef.ById(id)` / `RuleRef.ByName(name)`. Pass an
`HttpClient` to the constructor to control transport (and for tests).

## Build & test

```bash
dotnet test EDP.DecisionClient.Tests
```
