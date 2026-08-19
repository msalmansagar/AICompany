using System;
using System.Collections.Generic;
using EDP.RuleRuntime.Execution;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// One child record's verdict from a fanned-out evaluation (FR-F43). Addressed by position
    /// always, and by id when the element carries one — an unsaved grid row has no id, so a
    /// caller must not assume every verdict can be matched back to a persisted record (ADR-17).
    /// </summary>
    public sealed class ChildDecision
    {
        public ChildDecision(int index, string? id, RuleResult result)
        {
            Index = index;
            Id = id;
            Result = result ?? throw new ArgumentNullException(nameof(result));
        }

        /// <summary>Position in the source collection, zero-based. Always available.</summary>
        public int Index { get; }

        /// <summary>The element's own id, when it has one. Null for an unsaved or id-less element.</summary>
        public string? Id { get; }

        /// <summary>The decision for this element, with its own outputs and reason codes.</summary>
        public RuleResult Result { get; }
    }

    /// <summary>
    /// The result of evaluating one rule across a collection: every child's verdict, plus the
    /// counts an anchor-level summary is built from.
    ///
    /// ADR-17 requires the anchor summary to be the mandatory half and child detail the optional
    /// half, because a late directive may find no subgrid to apply to. These counts are what
    /// makes a summary such as "3 of 5 invoice lines failed" expressible without the caller
    /// re-walking the children.
    /// </summary>
    public sealed class FanOutOutcome
    {
        public FanOutOutcome(IReadOnlyList<ChildDecision> children, Guid? executionLogId)
        {
            Children = children ?? throw new ArgumentNullException(nameof(children));
            ExecutionLogId = executionLogId;
        }

        public IReadOnlyList<ChildDecision> Children { get; }

        /// <summary>One log id for the whole invocation. Per-child traces are not persisted in F1.</summary>
        public Guid? ExecutionLogId { get; }

        public int Total => Children.Count;

        public int MatchedCount
        {
            get
            {
                var matched = 0;
                foreach (var child in Children) if (child.Result.Matched) matched++;
                return matched;
            }
        }

        public int UnmatchedCount => Total - MatchedCount;

        /// <summary>True when every child evaluated without error — a failure in one is not hidden by the rest.</summary>
        public bool AllSucceeded
        {
            get
            {
                foreach (var child in Children) if (!child.Result.Success) return false;
                return true;
            }
        }
    }
}
