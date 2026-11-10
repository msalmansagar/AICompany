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
    }

    /// <summary>The org-wide qdb_survey_settings row.</summary>
    public sealed class SurveySettings
    {
        /// <summary>Customer (account) field holding the preferred language; empty = always the default.</summary>
        public string LanguageField { get; set; }

        public string DefaultLanguage { get; set; } = "en";
    }
}
