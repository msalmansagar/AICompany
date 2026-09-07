using System;
using System.Collections.Generic;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// What one fanned-out evaluation needs to know. A parameter object rather than five
    /// positional arguments, so the call site reads as a request and not as an ordering puzzle.
    /// </summary>
    public sealed class FanOutRequest
    {
        public FanOutRequest(IDictionary<string, object?> inputs, string childCollectionName, DateTime nowUtc)
        {
            if (string.IsNullOrWhiteSpace(childCollectionName))
                throw new ArgumentException("A child collection name is required to fan out.", nameof(childCollectionName));

            Inputs = inputs ?? throw new ArgumentNullException(nameof(inputs));
            ChildCollectionName = childCollectionName;
            NowUtc = nowUtc.ToUniversalTime();
        }

        /// <summary>Anchor-level inputs. Each child's own fields are layered over these.</summary>
        public IDictionary<string, object?> Inputs { get; }

        /// <summary>Name of the input holding the collection to evaluate across.</summary>
        public string ChildCollectionName { get; }

        /// <summary>One fixed clock for every child, so the whole fan-out replays identically.</summary>
        public DateTime NowUtc { get; }

        public Guid? RuleVersionId { get; set; }

        public Guid ActorId { get; set; }
    }
}
