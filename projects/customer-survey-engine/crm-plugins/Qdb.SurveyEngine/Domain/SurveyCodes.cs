namespace Qdb.SurveyEngine.Domain
{
    /// <summary>qdb_survey_trigger.qdb_trigger_kind (provisioning/manifest.mjs).</summary>
    public enum TriggerKind
    {
        Event = 100000000,
        Created = 100000001,
        Scheduled = 100000002,
        Milestone = 100000003,

        /// <summary>Addendum D: a general survey sent once, now or at a date and time, to an audience (FR-CSE-083).</summary>
        OneTime = 100000004,
    }

    /// <summary>qdb_survey_trigger.qdb_audience: who a One-time trigger sends to (FR-CSE-089).</summary>
    public enum AudienceKind
    {
        AllActiveCustomers = 100000000,
        Filter = 100000001,
    }

    /// <summary>qdb_survey_trigger.qdb_run_status: a One-time trigger runs once (FR-CSE-086).</summary>
    public enum OneTimeRunStatus
    {
        NotSent = 100000000,
        Sending = 100000001,
        Sent = 100000002,
        Failed = 100000003,
    }

    /// <summary>
    /// qdb_survey_trigger.qdb_run_status for a scheduled trigger's run of one period (ADR-011). Shares the
    /// One-time option set; Failed is One-time only and Stuck is scheduled only.
    /// </summary>
    public enum ScheduledRunStatus
    {
        NotSent = 100000000,
        Sending = 100000001,
        Sent = 100000002,
        Stuck = 100000004,
    }

    /// <summary>qdb_survey_setup.qdb_delivery_digital / qdb_delivery_legacy.</summary>
    public enum DeliveryChoice
    {
        Portal = 100000000,
        SecureLink = 100000001,
        None = 100000002,
    }

    /// <summary>qdb_survey_invitation.qdb_channel.</summary>
    public enum InvitationChannel
    {
        Portal = 100000000,
        SecureLink = 100000001,
    }

    /// <summary>qdb_survey_invitation.qdb_status.</summary>
    public enum InvitationStatus
    {
        Pending = 100000000,
        Postponed = 100000001,
        Submitted = 100000002,
        Expired = 100000003,
        Discarded = 100000004,
    }

    /// <summary>qdb_survey_suppression_log.qdb_reason: why a firing trigger sent nothing (NFR-CSE-001).</summary>
    public enum SuppressionReason
    {
        Fatigue = 100000000,
        PriorityLost = 100000001,
        Duplicate = 100000002,
        ChannelNone = 100000003,
        PostponedExpired = 100000004,
        OutsideWindow = 100000005,
        Inactive = 100000006,
        NoCustomer = 100000007,
        FormNotPublished = 100000008,

        /// <summary>B7: a secure-link invitation that could not be sent by SMS, email or either.</summary>
        NotDelivered = 100000009,
    }
}
