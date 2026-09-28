using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Contract;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Inputs
{
    /// <summary>Where a rule's input values came from; record-bound values are CRM-typed and trusted.</summary>
    public enum InputOrigin
    {
        /// <summary>Supplied by a caller as JSON (InputsJson), or fed forward by an upstream rule.</summary>
        Caller,
        /// <summary>Bound from the target record (TargetRef path); only declared facts and required/nullable are checked.</summary>
        Record,
    }

    /// <summary>A number the caller sent that cannot be held as System.Decimal (kept, not crashed on).</summary>
    public sealed class UnrepresentableNumber
    {
        public UnrepresentableNumber(string rawText) => RawText = rawText;
        public string RawText { get; }
        public override string ToString() => RawText;
    }

    /// <summary>The checked and, for strict rules, type-normalised inputs plus every diagnostic raised.</summary>
    public sealed class InputValidationResult
    {
        public InputValidationResult(IDictionary<string, object?> inputs, IReadOnlyList<RuleDiagnostic> diagnostics)
        {
            Inputs = inputs;
            Diagnostics = diagnostics;
        }
        public IDictionary<string, object?> Inputs { get; }
        public IReadOnlyList<RuleDiagnostic> Diagnostics { get; }
        public bool IsRejected => Diagnostics.Any(d => d.Severity == RuleErrorSeverity.Error);
    }

    /// <summary>
    /// Enforces a rule's input contract before evaluation (ADR-19). A strict rule accepts each
    /// declared type only in its JSON form (Option A: numbers are JSON numbers read exactly as
    /// decimal, booleans are JSON booleans) and converts values to their declared type, so no
    /// strict comparison can fall back to text. A lenient (legacy) rule is never refused for a
    /// type problem and its values are never changed; it only gains warnings.
    /// </summary>
    public sealed class InputContractValidator
    {
        public InputValidationResult Validate(PcrmDocument document, IDictionary<string, object?> supplied, InputOrigin origin)
        {
            if (!document.IsStrict) ThrowIfUnrepresentable(supplied);
            var diagnostics = new List<RuleDiagnostic>();
            var normalised = new Dictionary<string, object?>(supplied, StringComparer.OrdinalIgnoreCase);
            foreach (var input in document.Inputs)
                CheckInput(document, input, normalised, origin, diagnostics);
            if (origin == InputOrigin.Caller)
                ReportUndeclared(document, supplied, diagnostics);
            return new InputValidationResult(normalised, diagnostics);
        }

        private static void CheckInput(PcrmDocument document, PcrmInput input, IDictionary<string, object?> values,
            InputOrigin origin, List<RuleDiagnostic> diagnostics)
        {
            var present = values.TryGetValue(input.Name, out var value);
            if (!present || value == null)
            {
                CheckPresence(input, present, diagnostics);
                return;
            }
            // Record-bound values arrive CRM-typed from Dataverse metadata; only caller-supplied values are type-checked.
            if (origin == InputOrigin.Record && !input.IsDeclaredFact) return;
            var check = TypeCheck.Of(input.Type, value);
            if (check.IsValid)
            {
                if (document.IsStrict) values[input.Name] = check.Normalised;
                return;
            }
            var severity = document.IsStrict ? RuleErrorSeverity.Error : RuleErrorSeverity.Warning;
            diagnostics.Add(new RuleDiagnostic(check.Code, $"Input '{input.Name}': {check.Reason}", severity, input.Name));
        }

        private static void CheckPresence(PcrmInput input, bool present, List<RuleDiagnostic> diagnostics)
        {
            if (!present && input.Required)
                diagnostics.Add(new RuleDiagnostic("EDP060", $"Required input '{input.Name}' was not supplied.", RuleErrorSeverity.Error, input.Name));
            else if (present && !input.Nullable)
                diagnostics.Add(new RuleDiagnostic("EDP061", $"Input '{input.Name}' is null but the rule declares it not nullable.", RuleErrorSeverity.Error, input.Name));
        }

        private static void ReportUndeclared(PcrmDocument document, IDictionary<string, object?> supplied, List<RuleDiagnostic> diagnostics)
        {
            var known = new HashSet<string>(
                document.Inputs.Select(i => i.Name).Concat(document.Variables.Select(v => v.Name)).Concat(document.Retrievals.Select(r => r.Name)),
                StringComparer.OrdinalIgnoreCase);
            foreach (var name in supplied.Keys.Where(k => !known.Contains(k)).OrderBy(k => k, StringComparer.Ordinal))
                diagnostics.Add(new RuleDiagnostic("EDP067", $"Input '{name}' is not declared by the rule and was ignored.", RuleErrorSeverity.Info, name));
        }

        /// <summary>
        /// A legacy rule keeps its pre-1.1 behaviour: a caller number that cannot be held as a
        /// decimal used to fail JSON parsing, so it still fails here, with the same exception type.
        /// </summary>
        private static void ThrowIfUnrepresentable(IDictionary<string, object?> supplied)
        {
            var unrepresentable = supplied.Values.OfType<UnrepresentableNumber>().FirstOrDefault();
            if (unrepresentable != null)
                throw new FormatException($"The JSON value '{unrepresentable.RawText}' could not be converted to System.Decimal.");
        }
    }
}
