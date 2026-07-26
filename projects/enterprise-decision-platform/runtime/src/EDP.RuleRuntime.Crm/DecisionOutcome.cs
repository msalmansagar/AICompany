using System;
using EDP.RuleRuntime.Execution;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// A decision plus the address of its durable trace. The decision itself belongs to the
    /// CRM-agnostic core (<see cref="RuleResult"/>); the execution-log id is a Dataverse
    /// concern, so it is carried here at the adapter boundary rather than leaking into the core.
    /// </summary>
    public sealed class DecisionOutcome
    {
        public DecisionOutcome(RuleResult result, Guid? executionLogId)
        {
            Result = result;
            ExecutionLogId = executionLogId;
        }

        /// <summary>The decision produced by the runtime.</summary>
        public RuleResult Result { get; }

        /// <summary>
        /// Id of the qdb_edp_ruleexecutionlog record this decision was traced to, or null when
        /// the best-effort trace was dropped (ADR-13 tier 2). Callers address a past decision
        /// by this id (ExplainDecision); its absence never implies the decision failed.
        /// </summary>
        public Guid? ExecutionLogId { get; }
    }
}
