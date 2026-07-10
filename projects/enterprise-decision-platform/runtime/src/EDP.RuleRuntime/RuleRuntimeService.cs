using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Executor;
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
        private readonly ConcurrentDictionary<string, CompiledRule> _cache =
            new ConcurrentDictionary<string, CompiledRule>();

        public RuleRuntimeService(IMetadataResolver metadata)
        {
            if (metadata == null) throw new ArgumentNullException(nameof(metadata));
            _compiler = new RuleCompiler(metadata);
        }

        /// <summary>Compile (cached) then execute a PCRM rule against input values.</summary>
        public RuleResult Execute(string pcrmJson, IDictionary<string, object?> inputs, DateTime? nowUtc = null)
        {
            var compiled = CompileCached(pcrmJson);
            return _executor.Execute(compiled, inputs, nowUtc);
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
