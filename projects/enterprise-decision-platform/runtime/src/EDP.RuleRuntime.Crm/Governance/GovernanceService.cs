using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime.Crm.Sinks;

namespace EDP.RuleRuntime.Crm.Governance
{
    /// <summary>
    /// Maker-checker lifecycle engine for rule versions. Enforces the legal state
    /// machine and a TWO-STAGE approval (Business then Technical), records an approval
    /// entry per action, and writes an append-only audit entry for every transition.
    /// Segregation of duties (an approver may not be the submitter or the other-stage
    /// approver) is enforced in production environments. CRM-native: only
    /// IOrganizationService + the durable audit sink.
    /// </summary>
    public sealed class GovernanceService
    {
        private const int Draft = 100000000, InReview = 100000001, Approved = 100000002, Published = 100000003, Retired = 100000004;
        private const int ApPending = 100000000, ApApproved = 100000001, ApRejected = 100000002;

        private static readonly Dictionary<int, string> StateLabels = new Dictionary<int, string>
        {
            { Draft, "Draft" }, { InReview, "In Review" }, { Approved, "Approved" }, { Published, "Published" }, { Retired, "Retired" }
        };

        private const string StageSubmit = "Submit", StageBusiness = "Business Approval", StageTechnical = "Technical Approval", StageReject = "Reject";

        private readonly IOrganizationService _service;
        private readonly IAuditSink _audit;
        private readonly IPublishGate? _publishGate;

        public GovernanceService(IOrganizationService service, IAuditSink audit, IPublishGate? publishGate = null)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _audit = audit ?? throw new ArgumentNullException(nameof(audit));
            _publishGate = publishGate;
        }

        public sealed class GovernanceResult
        {
            public bool Success { get; set; }
            public string NewState { get; set; } = "";
            public string Stage { get; set; } = "";
            public string Message { get; set; } = "";
        }

        public GovernanceResult PerformAction(Guid ruleVersionId, string action, string? comments, Guid actorId)
        {
            var version = _service.Retrieve("qdb_edp_ruleversion", ruleVersionId, new ColumnSet("qdb_edp_lifecyclestate"));
            var current = version.GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate")?.Value ?? Draft;
            var rowVersion = version.RowVersion; // optimistic-concurrency token (M3)
            var act = (action ?? "").Trim().ToLowerInvariant();

            return act == "approve"
                ? Approve(ruleVersionId, rowVersion, current, comments, actorId)
                : SimpleTransition(ruleVersionId, rowVersion, act, current, comments, actorId);
        }

        // Business then Technical. First approval keeps the version In Review; the second moves it to Approved.
        private GovernanceResult Approve(Guid ruleVersionId, string rowVersion, int current, string? comments, Guid actorId)
        {
            if (current != InReview) throw new InvalidOperationException($"Approve is not allowed from state '{Label(current)}'.");

            var cycle = CurrentCycleApprovals(ruleVersionId);
            var approvedSoFar = cycle.Count(a => a.status == ApApproved);
            if (approvedSoFar >= 2) throw new InvalidOperationException("This version already has both approvals.");

            var stage = approvedSoFar == 0 ? StageBusiness : StageTechnical;
            EnforceSoD(ruleVersionId, cycle, actorId, stage);

            var target = approvedSoFar == 0 ? InReview : Approved; // second approval completes review
            // Touch the version under optimistic concurrency BEFORE recording the approval. Two
            // concurrent approvals read the same row version; only the first touch succeeds, so the
            // second is rejected instead of producing a duplicate approval / double transition (M3).
            TouchVersionOptimistic(ruleVersionId, rowVersion, target);
            CreateApproval(ruleVersionId, ApApproved, stage, comments, actorId);
            WriteAudit(ruleVersionId, stage, current, target, comments, actorId);

            return new GovernanceResult { Success = true, Stage = stage, NewState = Label(target),
                Message = $"{stage} recorded. State: {Label(target)}" };
        }

        private GovernanceResult SimpleTransition(Guid ruleVersionId, string rowVersion, string act, int current, string? comments, Guid actorId)
        {
            var (target, approvalStatus, stage) = act switch
            {
                "submit" => Guard(current == Draft, act, current, InReview, ApPending, StageSubmit),
                "reject" or "sendback" => Guard(current == InReview, act, current, Draft, ApRejected, StageReject),
                "publish" => Guard(current == Approved, act, current, Published, (int?)null, "Publish"),
                "unpublish" => Guard(current == Published, act, current, Draft, (int?)null, "Unpublish"),
                "retire" => Guard(current == Published, act, current, Retired, (int?)null, "Retire"),
                _ => throw new InvalidOperationException($"Unknown governance action '{act}'.")
            };

            if (act == "publish") EnforcePublishGate(ruleVersionId);

            TouchVersionOptimistic(ruleVersionId, rowVersion, target);
            if (approvalStatus.HasValue) CreateApproval(ruleVersionId, approvalStatus.Value, stage, comments, actorId);
            WriteAudit(ruleVersionId, stage, current, target, comments, actorId);
            return new GovernanceResult { Success = true, Stage = stage, NewState = Label(target), Message = $"{stage}: {Label(current)} -> {Label(target)}" };
        }

        // Regression gate: run the version's saved scenarios before it goes live. A failing gate
        // blocks the transition (no state change, no audit entry) — the same fail-closed shape as SoD.
        private void EnforcePublishGate(Guid ruleVersionId)
        {
            if (_publishGate == null) return;
            var gate = _publishGate.Check(ruleVersionId);
            if (!gate.Passed) throw new InvalidOperationException(gate.Message);
        }

        private static (int, int?, string) Guard(bool ok, string action, int current, int target, int? status, string stage)
        {
            if (!ok) throw new InvalidOperationException($"{action} is not allowed from state '{Label(current)}'.");
            return (target, status, stage);
        }

        // Approvals created after the most recent Submit (i.e. the current review cycle).
        private List<(int status, Guid actor, string stage)> CurrentCycleApprovals(Guid ruleVersionId)
        {
            var query = new QueryExpression("qdb_edp_ruleapproval")
            {
                ColumnSet = new ColumnSet("qdb_edp_approvalstatus", "qdb_edp_actor", "qdb_edp_ruleapprovalname", "createdon"),
                Orders = { new OrderExpression("createdon", OrderType.Ascending) },
                Criteria = { Conditions = { new ConditionExpression("qdb_edp_ruleversionid", ConditionOperator.Equal, ruleVersionId) } }
            };
            var all = _service.RetrieveMultiple(query).Entities
                .Select(e => new
                {
                    status = e.GetAttributeValue<OptionSetValue>("qdb_edp_approvalstatus")?.Value ?? ApPending,
                    actor = Guid.TryParse(e.GetAttributeValue<string>("qdb_edp_actor"), out var g) ? g : Guid.Empty,
                    name = e.GetAttributeValue<string>("qdb_edp_ruleapprovalname") ?? "",
                    created = e.GetAttributeValue<DateTime>("createdon")
                }).ToList();

            // Cycle = approvals at/after the latest Submit (by timestamp — robust to same-second ties,
            // unlike list ordering). On the fake (createdon = MinValue) this returns all, which is correct.
            var submits = all.Where(a => a.name.StartsWith(StageSubmit, StringComparison.OrdinalIgnoreCase)).ToList();
            var submitTime = submits.Count > 0 ? submits.Max(a => a.created) : DateTime.MinValue;
            return all.Where(a => a.created >= submitTime)
                      .Select(a => (a.status, a.actor, Stage(a.name))).ToList();
        }

        private void EnforceSoD(Guid ruleVersionId, List<(int status, Guid actor, string stage)> cycle, Guid approver, string stage)
        {
            if (!IsProduction()) return; // enforced only in production (consistent with ADR-12)
            var submitter = cycle.FirstOrDefault(a => a.stage == StageSubmit).actor;
            if (submitter != Guid.Empty && submitter == approver)
                throw new InvalidOperationException("Segregation of duties: the approver cannot be the submitter.");
            var priorApprovers = cycle.Where(a => a.status == ApApproved).Select(a => a.actor);
            if (priorApprovers.Contains(approver))
                throw new InvalidOperationException("Segregation of duties: Business and Technical approvals require different approvers.");
        }

        private bool IsProduction()
        {
            try
            {
                var q = new QueryExpression("environmentvariablevalue")
                {
                    ColumnSet = new ColumnSet("value"),
                    LinkEntities = { new LinkEntity("environmentvariablevalue", "environmentvariabledefinition", "environmentvariabledefinitionid", "environmentvariabledefinitionid", JoinOperator.Inner)
                        { LinkCriteria = { Conditions = { new ConditionExpression("schemaname", ConditionOperator.Equal, "qdb_edp_IsProductionEnvironment") } } } }
                };
                var v = _service.RetrieveMultiple(q).Entities.FirstOrDefault()?.GetAttributeValue<string>("value");
                return v != null && (v.Equals("yes", StringComparison.OrdinalIgnoreCase) || v.Equals("true", StringComparison.OrdinalIgnoreCase));
            }
            catch
            {
                // Fail SAFE (F-02): if we cannot read the production flag, assume production and
                // ENFORCE segregation of duties rather than silently disabling it.
                return true;
            }
        }

        // Set the version state under optimistic concurrency. Serializes governance actions per
        // version (M3): if the row changed since it was read, the update is rejected as a conflict.
        private void TouchVersionOptimistic(Guid ruleVersionId, string rowVersion, int target)
        {
            var update = new Entity("qdb_edp_ruleversion", ruleVersionId) { ["qdb_edp_lifecyclestate"] = new OptionSetValue(target) };
            if (!string.IsNullOrEmpty(rowVersion)) update.RowVersion = rowVersion;
            try
            {
                _service.Execute(new UpdateRequest { Target = update, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Concurrent governance action detected — the rule version changed during this action. Please retry.", ex);
            }
        }

        private void CreateApproval(Guid ruleVersionId, int status, string stage, string? comments, Guid actorId)
            => _service.Create(new Entity("qdb_edp_ruleapproval")
            {
                ["qdb_edp_ruleapprovalname"] = $"{stage} @ {DateTime.UtcNow:o}",
                ["qdb_edp_approvalstatus"] = new OptionSetValue(status),
                ["qdb_edp_comments"] = comments ?? string.Empty,
                ["qdb_edp_actor"] = actorId.ToString(),
                ["qdb_edp_actorid"] = new EntityReference("systemuser", actorId), // F-06
                ["qdb_edp_decidedon"] = DateTime.UtcNow,
                ["qdb_edp_ruleversionid"] = new EntityReference("qdb_edp_ruleversion", ruleVersionId)
            });

        private void WriteAudit(Guid ruleVersionId, string stage, int from, int to, string? comments, Guid actorId)
            => _audit.WriteAudit(new AuditEvent
            {
                RuleVersionId = ruleVersionId, Action = stage, Actor = actorId.ToString(), ActorId = actorId,
                Details = $"{Label(from)} -> {Label(to)}" + (string.IsNullOrWhiteSpace(comments) ? "" : $"; {comments}"),
                TimestampUtc = DateTime.UtcNow
            });

        private static string Stage(string approvalName) => approvalName.Split('@')[0].Trim();
        private static string Label(int state) => StateLabels.TryGetValue(state, out var l) ? l : state.ToString();
    }
}
