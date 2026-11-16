using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.OneTime
{
    /// <summary>A One-time trigger with its audience and run record (Addendum D, D.2).</summary>
    public sealed class OneTimeTrigger
    {
        /// <summary>The trigger and its setup, as every other trigger kind is read.</summary>
        public SurveyTrigger Trigger { get; set; }

        public bool IsTriggerActive { get; set; }
        public bool IsSetupActive { get; set; }
        public AudienceKind Audience { get; set; }

        /// <summary>The stored filter; used when <see cref="Audience"/> is Filter.</summary>
        public string AudienceFetchXml { get; set; }

        /// <summary>When the scheduler should send it; null = Send now only.</summary>
        public DateTime? SendOn { get; set; }

        public OneTimeRunState Run { get; set; } = new OneTimeRunState();
    }

    /// <summary>Where a send stands; committed after every page so an interrupted send resumes (ADR-010).</summary>
    public sealed class OneTimeRunState
    {
        public OneTimeRunStatus Status { get; set; } = OneTimeRunStatus.NotSent;

        /// <summary>The next page to read; 1 before the first page.</summary>
        public int NextPage { get; set; } = 1;

        /// <summary>The paging cookie returned with the last committed page; null before the first.</summary>
        public string PagingCookie { get; set; }

        public OneTimeCounts Counts { get; set; } = new OneTimeCounts();

        public DateTime? SentOn { get; set; }

        /// <summary>The row version read with the trigger; starting a send is conditional on it.</summary>
        public string RowVersion { get; set; }
    }

    /// <summary>Running totals of a send (FR-CSE-086).</summary>
    public sealed class OneTimeCounts
    {
        public int Invited { get; set; }
        public int Postponed { get; set; }
        public int Suppressed { get; set; }

        public OneTimeCounts Plus(OneTimeCounts other) => new OneTimeCounts
        {
            Invited = Invited + other.Invited,
            Postponed = Postponed + other.Postponed,
            Suppressed = Suppressed + other.Suppressed,
        };

        public override string ToString() => $"{Invited} invited, {Postponed} postponed, {Suppressed} suppressed";
    }

    /// <summary>One page of audience customer ids.</summary>
    public sealed class AudiencePage
    {
        public IReadOnlyList<Guid> CustomerIds { get; set; } = new Guid[0];
        public bool MoreRecords { get; set; }
        public string PagingCookie { get; set; }
    }

    /// <summary>Runs an audience query against CRM.</summary>
    public interface IAudienceReader
    {
        /// <summary>One page of the audience.</summary>
        AudiencePage ReadPage(AudienceQuery query, int pageNumber, string pagingCookie);

        /// <summary>How many customers the audience holds now (Preview, FR-CSE-084).</summary>
        int Count(AudienceQuery query);
    }

    /// <summary>Reads One-time triggers and records their runs. Writes run as SYSTEM.</summary>
    public interface IOneTimeTriggerStore
    {
        /// <summary>The trigger with its setup, or null when it does not exist or is not a One-time trigger.</summary>
        OneTimeTrigger Find(Guid triggerId);

        /// <summary>Active One-time triggers of active setups whose send time has come and that are Not sent or Sending, oldest send time first.</summary>
        IReadOnlyList<Guid> GetDueTriggerIds(DateTime nowUtc);

        /// <summary>Not sent → Sending, conditional on the row version read; false when someone else changed it first.</summary>
        bool TryStart(OneTimeTrigger trigger, DateTime nowUtc);

        /// <summary>Commits the cursor and totals after a page.</summary>
        void SaveProgress(Guid triggerId, OneTimeRunState state);

        /// <summary>Sending → Sent with the final totals.</summary>
        void Complete(Guid triggerId, OneTimeRunState state);

        /// <summary>→ Failed with the reason, shown on the trigger form; nothing more is sent.</summary>
        void Fail(Guid triggerId, string reason);
    }

    /// <summary>Answers whether a user may preview, send or save a One-time trigger (NFR-CSE-017).</summary>
    public interface IOneTimeAccessCheck
    {
        /// <summary>True for a System Administrator or a holder of the Survey Admin role, directly or through a team.</summary>
        bool MaySendSurveys(Guid userId);
    }

    /// <summary>What a Send call did.</summary>
    public sealed class OneTimeSendResult
    {
        public OneTimeRunStatus Status { get; set; }
        public OneTimeCounts Counts { get; set; } = new OneTimeCounts();

        /// <summary>False when the budget ran out; call again to continue.</summary>
        public bool IsComplete { get; set; }

        /// <summary>A refusal or failure reason; empty when the call went normally.</summary>
        public string Message { get; set; } = string.Empty;

        public override string ToString() => $"{Status}: {Counts}{(IsComplete ? string.Empty : " (continuing)")}{(Message.Length == 0 ? string.Empty : " — " + Message)}";
    }

    /// <summary>All collaborators of <see cref="OneTimeSendService"/>.</summary>
    public sealed class OneTimeSendDependencies
    {
        /// <summary>The shared trigger pipeline (config, languages, render cache, invitations, log, clock, trace).</summary>
        public SurveyTriggerDependencies Pipeline { get; set; }
        public IOneTimeTriggerStore Triggers { get; set; }
        public IAudienceReader Audience { get; set; }

        /// <summary>Dedupe keys already generated for a trigger's period key, so a resumed page skips them.</summary>
        public IScheduledInvitationReader GeneratedKeys { get; set; }

        /// <summary>The org's customer table (Survey Settings → Customer Table).</summary>
        public string CustomerTable { get; set; }
    }

    /// <summary>A Send or Preview the caller may not make; the message is shown to the administrator.</summary>
    public sealed class OneTimeSendRefusedException : Exception
    {
        public OneTimeSendRefusedException(string message) : base(message) { }
    }
}
