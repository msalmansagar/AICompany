using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>Answers whether a user may run qdb_srv_RunDueSurveys.</summary>
    public interface ISchedulerAccessCheck
    {
        /// <summary>True when the user is a System Administrator or holds the Survey Scheduler role, directly or through a team.</summary>
        bool MayRunDueSurveys(Guid userId);
    }

    /// <summary>Reads active scheduled triggers whose setup is also active.</summary>
    public interface IScheduledTriggerRepository
    {
        /// <summary>Each trigger carries its setup and <see cref="SurveyTrigger.Schedule"/>.</summary>
        IReadOnlyList<SurveyTrigger> GetActiveScheduledTriggers();
    }

    /// <summary>
    /// Writes a scheduled trigger's run record (ADR-011). Writes run as SYSTEM and are conditional on the
    /// row version in the state, so of two overlapping scheduler calls only one advances a run.
    /// </summary>
    public interface IScheduledRunStore
    {
        /// <summary>Saves the state; not saved when the trigger changed since <see cref="ScheduledRunState.RowVersion"/>.</summary>
        OneTime.RunWrite TrySave(Guid triggerId, ScheduledRunState state);
    }

    /// <summary>
    /// Finds the customers a scheduled trigger invites (FR-CSE-032), one page at a time in customer-id order.
    /// A page starts after the last customer id read, never at a page number, so customers leaving or joining
    /// the population between scheduler calls cannot make anyone be skipped (FR-003, analysis C3).
    /// </summary>
    public interface ICustomerPopulationReader
    {
        /// <summary>Active customers of the org's customer table after <paramref name="afterCustomerId"/> (null = from the first).</summary>
        CustomerPage ReadActiveCustomers(Guid? afterCustomerId, int pageSize);

        /// <summary>Distinct customers with at least one matching source record created in the period, after <paramref name="afterCustomerId"/>.</summary>
        CustomerPage ReadCustomersActiveIn(PopulationQuery query, Guid? afterCustomerId, int pageSize);
    }

    /// <summary>One page of a scheduled trigger's population.</summary>
    public sealed class CustomerPage
    {
        public IReadOnlyList<Guid> CustomerIds { get; set; } = new Guid[0];

        /// <summary>The last id read, including a row that was not a customer of the org's table; the next page starts after it.</summary>
        public Guid? LastReadId { get; set; }

        /// <summary>True when the population has no customers after this page.</summary>
        public bool IsLast { get; set; }
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

        /// <summary>Which of one page's dedupe keys already have an invitation for the period (research R4).</summary>
        ISet<string> FindExistingDedupeKeys(Guid setupId, string periodKey, IReadOnlyCollection<string> dedupeKeys);
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

        /// <summary>Clears PII fields: customer, invitation link, source table/record, answers JSON and each answer text.</summary>
        void Anonymise(Guid responseId);
    }

    /// <summary>Finds and deletes invitation rows past the retention floor (FR-CSE-076).</summary>
    public interface IInvitationRetentionStore
    {
        /// <summary>Invitation ids whose qdb_generated_on is older than the cutoff, ordered oldest first.</summary>
        IReadOnlyList<Guid> FindGeneratedBefore(DateTime cutoffUtc);

        /// <summary>Deletes the invitation; its responses and answers go with it (cascade).</summary>
        void Delete(Guid invitationId);
    }

    /// <summary>Finds and deletes suppression-log rows past the retention floor (FR-CSE-077).</summary>
    public interface ISuppressionLogRetentionStore
    {
        /// <summary>Suppression log ids whose createdon is older than the cutoff, ordered oldest first.</summary>
        IReadOnlyList<Guid> FindCreatedBefore(DateTime cutoffUtc);

        void Delete(Guid suppressionLogId);
    }

    /// <summary>
    /// Remembers the last run date whose once-a-day passes all completed (qdb_survey_settings.
    /// qdb_daily_passes_completed_on), so a scheduler calling every 15 minutes runs them once a day (ADR-010).
    /// </summary>
    public interface IDailyPassGate
    {
        /// <summary>The last run date whose daily passes completed; null when they never have.</summary>
        DateTime? LastCompletedOn();

        /// <summary>Records that the daily passes completed for this run date.</summary>
        void MarkCompleted(DateTime runDate);
    }

    /// <summary>All collaborators of <see cref="RunDueSurveysService"/>.</summary>
    public sealed class RunDueSurveysDependencies
    {
        /// <summary>The shared trigger pipeline collaborators (config, render cache, invitations, log, clock, trace).</summary>
        public SurveyTriggerDependencies Pipeline { get; set; }
        public IScheduledTriggerRepository ScheduledTriggers { get; set; }
        public ICustomerPopulationReader Population { get; set; }
        public IScheduledInvitationReader ScheduledInvitations { get; set; }

        /// <summary>Writes scheduled triggers' run records (ADR-011).</summary>
        public IScheduledRunStore ScheduledRuns { get; set; }

        public IPostponedInvitationStore Postponed { get; set; }
        public IResponseRetentionStore Retention { get; set; }

        /// <summary>Deletes invitation rows past the floor (FR-CSE-076, Addendum C).</summary>
        public IInvitationRetentionStore InvitationRetention { get; set; }

        /// <summary>Deletes suppression-log rows past the floor (FR-CSE-077, Addendum C).</summary>
        public ISuppressionLogRetentionStore SuppressionLogRetention { get; set; }

        /// <summary>One-time triggers and their runs (Addendum D).</summary>
        public OneTime.IOneTimeTriggerStore OneTimeTriggers { get; set; }

        /// <summary>Runs One-time audience queries (Addendum D).</summary>
        public OneTime.IAudienceReader Audience { get; set; }

        /// <summary>The org's customer table, for One-time audiences.</summary>
        public string CustomerTable { get; set; }

        /// <summary>Runs the daily passes once per run date (ADR-010).</summary>
        public IDailyPassGate DailyPassGate { get; set; }

        /// <summary>The scheduler's account (the caller); recorded as who started a dated One-time send (AUD-D-01).</summary>
        public Guid CallerId { get; set; }
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
