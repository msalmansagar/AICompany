using System;
using EDP.RuleRuntime.Inputs;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>Who asked for one decision, when, for which version, and where its inputs came from.</summary>
    internal sealed class DecisionCall
    {
        public DecisionCall(Guid? ruleVersionId, Guid actorId, DateTime nowUtc, InputOrigin origin)
        {
            RuleVersionId = ruleVersionId;
            ActorId = actorId;
            NowUtc = nowUtc;
            Origin = origin;
        }

        public Guid? RuleVersionId { get; }
        public Guid ActorId { get; }
        public DateTime NowUtc { get; }
        public InputOrigin Origin { get; }
    }
}
