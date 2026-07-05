using System;
using System.Collections.Generic;

namespace EDP.RuleRuntime.Execution
{
    public enum RuleErrorSeverity { Error, Warning }

    public sealed class RuleDiagnostic
    {
        public RuleDiagnostic(string code, string message, RuleErrorSeverity severity = RuleErrorSeverity.Error, string? location = null)
        {
            Code = code;
            Message = message;
            Severity = severity;
            Location = location;
        }

        public string Code { get; }
        public string Message { get; }
        public RuleErrorSeverity Severity { get; }
        public string? Location { get; }

        public override string ToString() => $"[{Severity}] {Code}: {Message}" + (Location != null ? $" ({Location})" : "");
    }

    /// <summary>Base for typed runtime exceptions. Never swallow; always carry context.</summary>
    public abstract class RuleRuntimeException : Exception
    {
        protected RuleRuntimeException(string code, string message, Exception? inner = null) : base(message, inner)
        {
            Code = code;
        }
        public string Code { get; }
    }

    public sealed class RuleCompilationException : RuleRuntimeException
    {
        public RuleCompilationException(string message, IReadOnlyList<RuleDiagnostic> diagnostics, Exception? inner = null)
            : base("rule_compilation_failed", message, inner) => Diagnostics = diagnostics;
        public IReadOnlyList<RuleDiagnostic> Diagnostics { get; }
    }

    public sealed class RuleExecutionException : RuleRuntimeException
    {
        public RuleExecutionException(string message, Exception? inner = null)
            : base("rule_execution_failed", message, inner) { }
    }

    public sealed class FormulaException : RuleRuntimeException
    {
        public FormulaException(string message, Exception? inner = null)
            : base("formula_error", message, inner) { }
    }
}
