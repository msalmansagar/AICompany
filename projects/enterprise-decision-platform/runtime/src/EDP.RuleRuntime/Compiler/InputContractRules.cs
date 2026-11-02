using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Contract;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Hashing;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Compiler
{
    /// <summary>
    /// Author-time checks for declared facts and the strict input contract (ADR-19, FR-B1/B2).
    /// Every check that can refuse a rule applies only to rules that opt into the strict contract
    /// or into the explicit "declared" marker, so no pre-1.1 rule can start failing validation.
    /// </summary>
    public static class InputContractRules
    {
        public static IReadOnlyList<RuleDiagnostic> Validate(PcrmDocument document)
        {
            var diagnostics = new List<RuleDiagnostic>();
            foreach (var input in document.Inputs)
                CheckDeclaration(input, diagnostics);
            if (document.DeclaresStrictContract && !document.IsStrict)
                diagnostics.Add(new RuleDiagnostic("EDP065",
                    $"A strict input contract requires schemaVersion \"{EngineContract.Current.StrictSchemaVersion}\"; this rule declares \"{document.SchemaVersion}\".",
                    RuleErrorSeverity.Error));
            if (document.IsStrict)
                CheckStrictRule(document, diagnostics);
            return diagnostics;
        }

        private static void CheckDeclaration(PcrmInput input, List<RuleDiagnostic> diagnostics)
        {
            var markedDeclared = string.Equals(input.Source, "declared", StringComparison.OrdinalIgnoreCase);
            if (markedDeclared && !input.IsDeclaredFact)
                diagnostics.Add(new RuleDiagnostic("EDP069",
                    $"Input '{input.Name}' is marked as a declared fact but also carries a binding, relationship or aggregate.",
                    RuleErrorSeverity.Error, input.Name));
            else if (input.IsDeclaredFact)
                diagnostics.Add(new RuleDiagnostic("EDP064",
                    $"Input '{input.Name}' is a declared fact: supplied by the caller or an upstream rule, never read from the record.",
                    RuleErrorSeverity.Info, input.Name));
        }

        private static void CheckStrictRule(PcrmDocument document, List<RuleDiagnostic> diagnostics)
        {
            // FR-B2-05: EDP066 is about DECLARED facts. A record-bound Lookup is read from Dataverse
            // metadata and stays allowed; only declaring a Lookup fact in a strict rule is refused.
            foreach (var input in document.Inputs.Where(i => i.IsDeclaredFact && EngineContract.Current.StrictKindOf(i.Type) == StrictTypeKind.Unsupported))
                diagnostics.Add(new RuleDiagnostic("EDP066",
                    $"Declared fact '{input.Name}' has type '{input.Type}', which cannot be declared in a strict rule in Release 1.",
                    RuleErrorSeverity.Error, input.Name));
            foreach (var collection in QuantifiedInputs(document))
                diagnostics.Add(new RuleDiagnostic("EDP066",
                    $"Input '{collection}' is quantified over, so a strict rule must declare it as type 'Collection'.",
                    RuleErrorSeverity.Error, collection));
            foreach (var literal in NumericLiterals(document).Where(l => !IsExactDecimal(l)))
                diagnostics.Add(new RuleDiagnostic("EDP068",
                    $"The numeric literal {literal} is not exactly representable as a decimal.", RuleErrorSeverity.Error));
        }

        /// <summary>Inputs a quantifier iterates that are not declared as collections.</summary>
        private static IEnumerable<string> QuantifiedInputs(PcrmDocument document)
        {
            var inputsByName = document.Inputs.ToDictionary(i => i.Name, StringComparer.OrdinalIgnoreCase);
            return AllGroups(document)
                .SelectMany(g => g.Quantifiers)
                .Select(q => q.Collection)
                .Where(name => inputsByName.TryGetValue(name, out var input)
                               && EngineContract.Current.StrictKindOf(input.Type) != StrictTypeKind.Collection)
                .Distinct(StringComparer.OrdinalIgnoreCase);
        }

        private static IEnumerable<PcrmGroup> AllGroups(PcrmDocument document)
        {
            var roots = document.Logic.Rules.Select(r => r.When)
                .Concat(document.Retrievals.Where(r => r.Filter != null).Select(r => r.Filter!));
            return roots.SelectMany(Descend);
        }

        private static IEnumerable<PcrmGroup> Descend(PcrmGroup group)
            => new[] { group }.Concat(group.Groups.SelectMany(Descend)).Concat(group.Quantifiers.SelectMany(q => Descend(q.Where)));

        /// <summary>Every numeric literal in the rule logic, as its raw JSON text.</summary>
        private static IEnumerable<string> NumericLiterals(PcrmDocument document)
        {
            var logic = document.Logic;
            var elements = logic.Rows.SelectMany(r => r.Cells.SelectMany(c => new[] { c.Value, c.Value2 }).Concat(r.Outputs.Values))
                .Concat(logic.DefaultRow?.Outputs.Values ?? Enumerable.Empty<JsonElement>())
                .Concat(logic.Rules.SelectMany(r => r.Then.Values))
                .Concat(logic.Otherwise?.Values ?? Enumerable.Empty<JsonElement>())
                .Concat(AllGroups(document).SelectMany(g => g.Conditions.SelectMany(c => new[] { c.Value, c.Value2 })));
            return elements.SelectMany(NumbersIn);
        }

        private static IEnumerable<string> NumbersIn(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.Number: return new[] { element.GetRawText() };
                case JsonValueKind.Array: return element.EnumerateArray().SelectMany(NumbersIn);
                case JsonValueKind.Object: return element.EnumerateObject().SelectMany(p => NumbersIn(p.Value));
                default: return Enumerable.Empty<string>();
            }
        }

        private static bool IsExactDecimal(string raw)
        {
            if (!decimal.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value)) return false;
            var limit = EngineContract.Current.MaxExponentMagnitude;
            try
            {
                return CanonicalNumber.Canonicalize(raw, limit) == CanonicalNumber.Canonicalize(value.ToString(CultureInfo.InvariantCulture), limit);
            }
            catch (FormatException)
            {
                return false;
            }
        }
    }
}
