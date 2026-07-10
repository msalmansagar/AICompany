using System;

namespace EDP.RuleRuntime.Crm.Governance
{
    /// <summary>
    /// A pre-publish check. The governance engine calls this immediately before a version
    /// transitions to Published; a failing gate blocks the transition. Injecting it (rather than
    /// hard-wiring the runtime into <see cref="GovernanceService"/>) keeps the state machine
    /// unit-testable in isolation — tests pass no gate and see the legacy behaviour.
    /// </summary>
    public interface IPublishGate
    {
        PublishGateResult Check(Guid ruleVersionId);
    }

    public sealed class PublishGateResult
    {
        public bool Passed { get; set; }
        public string Message { get; set; } = "";

        public static PublishGateResult Pass(string message = "") => new PublishGateResult { Passed = true, Message = message };
        public static PublishGateResult Block(string message) => new PublishGateResult { Passed = false, Message = message };
    }
}
