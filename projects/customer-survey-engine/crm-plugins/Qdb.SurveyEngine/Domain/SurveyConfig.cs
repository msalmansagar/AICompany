using System;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>A qdb_survey_source row: which CRM table triggers surveys and how to read it.</summary>
    public sealed class SurveySource
    {
        /// <summary>Creates a source configuration.</summary>
        public SurveySource(Guid id, string tableLogicalName, SourceFields fields)
        {
            Id = id;
            TableLogicalName = tableLogicalName ?? throw new ArgumentNullException(nameof(tableLogicalName));
            Fields = fields ?? throw new ArgumentNullException(nameof(fields));
        }

        public Guid Id { get; }
        public string TableLogicalName { get; }
        public SourceFields Fields { get; }
    }

    /// <summary>The field names a source reads from its request table (per-org, FR-CSE-006).</summary>
    public sealed class SourceFields
    {
        public string CustomerLookup { get; set; }
        public string Type { get; set; }
        public string Status { get; set; } = "statuscode";

        /// <summary>The Digital/Legacy field; empty means every request counts as Digital (section 4.11).</summary>
        public string Origin { get; set; }

        public CodeList DigitalOriginValues { get; set; } = CodeList.Empty;

        /// <summary>Whether this source's records count toward milestones (Disbursements yes, Fund Transfers never; FR-CSE-035).</summary>
        public bool CountsTowardMilestones { get; set; }
    }

    /// <summary>A qdb_survey_setup row: the survey form, delivery per origin and active window.</summary>
    public sealed class SurveySetup
    {
        public Guid Id { get; set; }
        public string FormCode { get; set; }
        public DeliveryChoice DeliveryDigital { get; set; } = DeliveryChoice.Portal;
        public DeliveryChoice DeliveryLegacy { get; set; } = DeliveryChoice.Portal;

        /// <summary>First day the setup may send (date only, inclusive); null = no start limit.</summary>
        public DateTime? ActiveFrom { get; set; }

        /// <summary>Last day the setup may send (date only, inclusive); null = no end limit.</summary>
        public DateTime? ActiveTo { get; set; }

        /// <summary>Days from generation until the invitation expires; null = never.</summary>
        public int? ExpiryDays { get; set; }
    }

    /// <summary>A qdb_survey_trigger row together with the setup it belongs to.</summary>
    public sealed class SurveyTrigger
    {
        public Guid Id { get; set; }
        public TriggerKind Kind { get; set; }
        public CodeList StatusValues { get; set; } = CodeList.Empty;
        public CodeList TypeValues { get; set; } = CodeList.Empty;
        public SurveySetup Setup { get; set; }

        /// <summary>Lower wins; null = the kind's default (see <see cref="PriorityRule"/>).</summary>
        public int? Priority { get; set; }

        /// <summary>What happens when fatigue or a higher-priority trigger blocks this one; null = the kind's default.</summary>
        public FatigueAction? FatigueAction { get; set; }

        /// <summary>When the trigger row was created; the activation moment when the setup has no Active From.</summary>
        public DateTime CreatedOn { get; set; }

        public MilestoneSettings Milestone { get; set; } = new MilestoneSettings();

        /// <summary>Set for a scheduled trigger only.</summary>
        public ScheduleSettings Schedule { get; set; }
    }

    /// <summary>What a blocked trigger does (FR-CSE-041).</summary>
    public enum FatigueAction
    {
        Drop = 100000000,
        Postpone = 100000001,
    }

    /// <summary>A milestone trigger's counting rules (FR-CSE-034..039).</summary>
    public sealed class MilestoneSettings
    {
        public int EveryN { get; set; } = 5;
        public CodeList TypeValues { get; set; } = CodeList.Empty;
        public CodeList StatusValues { get; set; } = CodeList.Empty;

        /// <summary>Only records created on or after this count; null = all history.</summary>
        public DateTime? CountFrom { get; set; }

        /// <summary>True (default): milestones already passed at activation never fire.</summary>
        public bool SkipReached { get; set; } = true;
    }

    /// <summary>The org-wide qdb_survey_settings row.</summary>
    public sealed class SurveySettings
    {
        /// <summary>Minimum days between invitations per customer; 0 switches the limit off (FR-CSE-040).</summary>
        public int FatigueMinDays { get; set; } = 30;

        /// <summary>Customer (account) field holding the preferred language; empty = always the default.</summary>
        public string LanguageField { get; set; }

        public string DefaultLanguage { get; set; } = "en";

        /// <summary>Days a response is kept; null or 0 = retention off until Compliance sets it (FR-CSE-058, OQ-A1).</summary>
        public int? RetentionDays { get; set; }

        /// <summary>Delete or anonymise; null = not chosen, so the retention pass does nothing.</summary>
        public RetentionMode? RetentionMode { get; set; }
    }

    /// <summary>qdb_survey_settings.qdb_retention_mode.</summary>
    public enum RetentionMode
    {
        Delete = 100000000,
        Anonymise = 100000001,
    }

    /// <summary>A scheduled trigger's calendar and population (FR-CSE-031, 032).</summary>
    public sealed class ScheduleSettings
    {
        public SchedulePeriod Period { get; set; }
        public SchedulePopulation Population { get; set; }

        /// <summary>For Active in period: the source whose records make a customer active; null otherwise.</summary>
        public SurveySource PopulationSource { get; set; }
    }
}
