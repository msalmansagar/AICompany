using System;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>
    /// Where a scheduled trigger's run for one period has reached, as stored on the trigger
    /// (data-model.md, Scheduled run progress; ADR-011). The engine writes it after every page, so an
    /// interrupted run resumes from <see cref="LastCustomerId"/> in the next call.
    /// </summary>
    public sealed class ScheduledRunState
    {
        /// <summary>qdb_run_message is a 2,000-character column; longer text is cut before it is written.</summary>
        public const int MessageMaxLength = 2000;

        /// <summary>Not sent, Sending (running), Sent (completed) or Stuck (qdb_run_status).</summary>
        public ScheduledRunStatus Status { get; set; } = ScheduledRunStatus.NotSent;

        /// <summary>The period the run belongs to (2026-Q4, 2026-12, 2026); null before the first run.</summary>
        public string PeriodKey { get; set; }

        /// <summary>The last customer read; the next page starts after it. Null = from the first customer.</summary>
        public Guid? LastCustomerId { get; set; }

        /// <summary>Customers evaluated so far: invited, postponed, suppressed or already holding the invitation.</summary>
        public int Evaluated { get; set; }

        /// <summary>Invitations created as Pending in this period's run.</summary>
        public int Invited { get; set; }

        /// <summary>Invitations created as Postponed (fatigue) in this period's run.</summary>
        public int Postponed { get; set; }

        /// <summary>Customers logged in the suppression log in this period's run.</summary>
        public int Suppressed { get; set; }

        /// <summary>Failed scheduler calls in a row at the current position; a saved page resets it.</summary>
        public int FailedCalls { get; set; }

        /// <summary>When the run for this period started (qdb_run_started_on).</summary>
        public DateTime? StartedOn { get; set; }

        /// <summary>When the run last moved or a failure was counted; the form's "last updated".</summary>
        public DateTime? ProgressOn { get; set; }

        /// <summary>The progress line, or when Stuck the reason (qdb_run_message, cut to <see cref="MessageMaxLength"/>).</summary>
        public string Message { get; set; }

        /// <summary>The trigger's row version when read or last written; every write is conditional on it.</summary>
        public string RowVersion { get; set; }

        /// <summary>True while the run has customers left: Sending, or Stuck waiting for its retry.</summary>
        public bool IsUnfinished => Status == ScheduledRunStatus.Sending || Status == ScheduledRunStatus.Stuck;

        /// <summary>A copy, so a page's result never changes the state it started from.</summary>
        public ScheduledRunState Copy() => (ScheduledRunState)MemberwiseClone();
    }
}
