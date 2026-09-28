using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Executor;
using EDP.RuleRuntime.Inputs;
using EDP.RuleRuntime.Metadata;

namespace EDP.RuleRuntime
{
    /// <summary>
    /// The single runtime facade every entry point (Plugin, Workflow Activity, Custom
    /// Action, future Custom API) calls. Compiles-and-caches by PCRM content hash, then
    /// executes. Entry-point adapters contain no decision logic — they only marshal
    /// inputs into <see cref="Execute"/> and marshal the result back out.
    /// </summary>
    public sealed class RuleRuntimeService
    {
        private readonly RuleCompiler _compiler;
        private readonly RuleExecutor _executor = new RuleExecutor();
        private readonly InputContractValidator _inputContract = new InputContractValidator();
        private readonly ConcurrentDictionary<string, CompiledRule> _cache =
            new ConcurrentDictionary<string, CompiledRule>();

        public RuleRuntimeService(IMetadataResolver metadata)
        {
            if (metadata == null) throw new ArgumentNullException(nameof(metadata));
            _compiler = new RuleCompiler(metadata);
        }

        /// <summary>
        /// Compile (cached), enforce the rule's input contract, then execute (ADR-19). A strict rule
        /// whose input breaks its contract returns INPUT_REJECTED without evaluating anything; the
        /// values a strict rule does evaluate are already converted to their declared types.
        /// </summary>
        public RuleResult Execute(string pcrmJson, IDictionary<string, object?> inputs, DateTime? nowUtc = null, InputOrigin origin = InputOrigin.Caller)
        {
            var compiled = CompileCached(pcrmJson);
            var validation = _inputContract.Validate(compiled.Document, inputs, origin);
            if (validation.IsRejected)
                return RuleResult.Rejected(validation.Diagnostics, RejectionTrace(validation));
            return _executor.Execute(compiled, validation.Inputs, nowUtc).WithAdditionalDiagnostics(validation.Diagnostics);
        }

        /// <summary>
        /// Check inputs against the rule's contract without evaluating. The record path calls this
        /// after binding the anchor inputs and before any retrieval runs (FR-B2-07).
        /// </summary>
        public InputValidationResult ValidateInputs(string pcrmJson, IDictionary<string, object?> inputs, InputOrigin origin)
            => _inputContract.Validate(CompileCached(pcrmJson).Document, inputs, origin);

        private static ExecutionTrace RejectionTrace(InputValidationResult validation)
        {
            var trace = new ExecutionTrace();
            foreach (var diagnostic in validation.Diagnostics)
                if (diagnostic.Severity == RuleErrorSeverity.Error)
                    trace.Add("input-contract", $"{diagnostic.Code}: {diagnostic.Message}", false);
            return trace;
        }

        /// <summary>
        /// The local Test Rule harness: compile + execute against caller-supplied inputs
        /// with a fixed clock, returning the decision, outputs, trace, and timing. Runs
        /// with no live CRM when given an in-memory metadata resolver (Milestone A).
        /// </summary>
        public RuleResult TestRule(string pcrmJson, IDictionary<string, object?> inputs, DateTime nowUtc)
            => Execute(pcrmJson, inputs, nowUtc);

        public CompiledRule Compile(string pcrmJson) => CompileCached(pcrmJson);

        private CompiledRule CompileCached(string pcrmJson)
        {
            // Cache by content so identical PCRM never recompiles. Note: in the plugin
            // sandbox this cache is per-AppDomain and non-durable by design (ADR-R cache
            // strategy); it is a within-process optimisation, not a persistence guarantee.
            var key = RuleCompiler.ComputeHash(pcrmJson);
            return _cache.GetOrAdd(key, _ => _compiler.Compile(pcrmJson));
        }
    }
}
