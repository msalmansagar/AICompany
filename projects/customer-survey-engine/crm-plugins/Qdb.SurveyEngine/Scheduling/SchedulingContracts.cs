using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>Answers whether a user may run qdb_srv_RunDueSurveys.</summary>
    public interface ISchedulerAccessCheck
    {
        bool MayRunDueSurveys(Guid userId);
    }

    /// <summary>Reads active scheduled triggers whose setup is also active.</summary>
    public interface IScheduledTriggerRepository
    {
        /// <summary>Each trigger carries its setup and <see cref="SurveyTrigger.Schedule"/>.</summary>
        IReadOnlyList<SurveyTrigger> GetActiveScheduledTriggers();
    }

    /// <summary>Finds the customers a scheduled trigger invites (FR-CSE-032).</summary>
    public interface ICustomerPopulationReader
    {
        /// <summary>Every active account.</summary>
        IReadOnlyList<Guid> GetActiveCustomers();

        /// <summary>Distinct customers with at least one matching source record created in the period.</summary>
        IReadOnlyList<Guid> GetCustomersActiveIn(PopulationQuery query);
    }

    /// <summary>Which source records make a customer "active in period".</summary>
    public sealed class PopulationQuery
    {
        public SurveySource Source { get; set; }
        public ReviewedPeriod Period { get; set; }

        /// <summary>Empty = any status.</summary>
        public CodeList StatusValues { get; set; } = CodeList.Empty;

        /// <summary>Empty = any type.</summary>
        public CodeList TypeValues { get; set; } = CodeList.Empty;
    }

    /// <summary>Reads the invitations a scheduled trigger already generated for a period.</summary>
    public interface IScheduledInvitationReader
    {
        /// <summary>The dedupe keys of the setup's invitations for the period, so a re-run skips them in memory.</summary>
        ISet<string> GetDedupeKeys(Guid setupId, string periodKey);
    }

    /// <summary>A Postponed invitation waiting for release (FR-CSE-042).</summary>
    public sealed class PostponedInvitation
    {
        public Guid Id { get; set; }
        public Guid CustomerId { get; set; }
        public Guid TriggerId { get; set; }
        public SurveySetup Setup { get; set; }
        public bool IsSetupActive { get; set; }
        public string SourceTable { get; set; }
        public Guid? SourceRecordId { get; set; }
        public DateTime? ExpiresOn { get; set; }

        /// <summary>The row version read with the invitation; a change by anyone else makes the update fail.</summary>
        public string RowVersion { get; set; }
    }

    /// <summary>Reads and moves Postponed invitations; every move is conditional on the row not having changed.</summary>
    public interface IPostponedInvitationStore
    {
        /// <summary>Postponed invitations, oldest first.</summary>
        IReadOnlyList<PostponedInvitation> GetPostponed();

        /// <summary>Postponed → Pending, generated now; false when the row changed since it was read.</summary>
        bool TryRelease(PostponedInvitation invitation, DateTime nowUtc);

        /// <summary>Postponed → Discarded; false when the row changed since it was read.</summary>
        bool TryDiscard(PostponedInvitation invitation);
    }

    /// <summary>Finds and removes responses past the retention period (FR-CSE-058).</summary>
    public interface IResponseRetentionStore
    {
        /// <summary>Responses submitted before the cutoff.</summary>
        IReadOnlyList<Guid> FindSubmittedBefore(DateTime cutoffUtc);

        /// <summary>Responses submitted before the cutoff that still identify the customer.</summary>
        IReadOnlyList<Guid> FindIdentifiedSubmittedBefore(DateTime cutoffUtc);

        /// <summary>Deletes the response; its answers go with it (cascade).</summary>
        void Delete(Guid responseId);

        /// <summary>Clears the customer, the answers JSON and every answer's text; numeric answers stay for reporting.</summary>
        void Anonymise(Guid responseId);
    }

    /// <summary>All collaborators of <see cref="RunDueSurveysService"/>.</summary>
    public sealed class RunDueSurveysDependencies
    {
        /// <summary>The shared trigger pipeline collaborators (config, render cache, invitations, log, clock, trace).</summary>
        public SurveyTriggerDependencies Pipeline { get; set; }
        public IScheduledTriggerRepository ScheduledTriggers { get; set; }
        public ICustomerPopulationReader Population { get; set; }
        public IScheduledInvitationReader ScheduledInvitations { get; set; }
        public IPostponedInvitationStore Postponed { get; set; }
        public IResponseRetentionStore Retention { get; set; }
    }

    /// <summary>
    /// How long one call may work. A Custom API runs inside the 2-minute plugin limit, so each pass
    /// stops when the budget is spent and the caller calls again; every pass is idempotent.
    /// </summary>
    public sealed class RunBudget
    {
        private readonly IClock _clock;
        private readonly DateTime _deadline;

        public RunBudget(IClock clock, TimeSpan allowance)
        {
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _deadline = clock.UtcNow + allowance;
        }

        /// <summary>True once the allowance has run out.</summary>
        public bool IsExhausted => _clock.UtcNow >= _deadline;
    }
}
