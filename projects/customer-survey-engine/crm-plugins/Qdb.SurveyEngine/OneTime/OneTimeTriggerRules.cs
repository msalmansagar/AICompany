using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.OneTime
{
    /// <summary>A save of a One-time trigger, merged with what the row already holds.</summary>
    public sealed class OneTimeTriggerSave
    {
        public bool IsCreate { get; set; }

        /// <summary>The columns the save writes.</summary>
        public ISet<string> ChangedColumns { get; set; } = new HashSet<string>();

        public AudienceKind Audience { get; set; } = AudienceKind.AllActiveCustomers;
        public string AudienceFetchXml { get; set; }
        public bool IsActive { get; set; }
        public OneTimeRunStatus Status { get; set; } = OneTimeRunStatus.NotSent;
        public bool IsCallerSurveyAdmin { get; set; }
    }

    /// <summary>
    /// What a save of a One-time trigger must satisfy (FR-CSE-089..091, NFR-CSE-017, ADR-009). Only saves of
    /// the trigger's definition are checked: the send APIs write the run record as SYSTEM on behalf of the
    /// scheduler account, which is not a Survey Admin, and must never be refused.
    /// </summary>
    public static class OneTimeTriggerRules
    {
        /// <summary>The columns that define who receives the survey and when.</summary>
        public static readonly IReadOnlyCollection<string> DefinitionColumns = new[]
        {
            "qdb_trigger_kind", "qdb_survey_setup_id", "qdb_audience", "qdb_audience_fetchxml", "qdb_send_on", "qdb_is_active",
        };

        private static readonly string[] AudienceColumns = { "qdb_audience", "qdb_audience_fetchxml" };

        /// <summary>True when the save writes a definition column (always on create).</summary>
        public static bool TouchesDefinition(OneTimeTriggerSave save) => save.IsCreate || save.ChangedColumns.Any(DefinitionColumns.Contains);

        /// <summary>Why the save must be refused, or null when it may go ahead.</summary>
        public static string FindProblem(OneTimeTriggerSave save, string customerTable)
        {
            if (!TouchesDefinition(save)) return null;
            if (!save.IsCallerSurveyAdmin) return "Only a System Administrator or a Survey Admin can create or change a One-time survey trigger.";
            if (save.Status == OneTimeRunStatus.Sending && save.ChangedColumns.Any(AudienceColumns.Contains))
                return "This survey is being sent; its audience cannot change until the send finishes.";
            return FindAudienceProblem(save, customerTable);
        }

        // An inactive draft may keep an empty filter; an active trigger needs one that works.
        private static string FindAudienceProblem(OneTimeTriggerSave save, string customerTable)
        {
            if (save.Audience != AudienceKind.Filter) return null;
            if (string.IsNullOrWhiteSpace(save.AudienceFetchXml) && !save.IsActive) return null;
            try
            {
                AudienceQuery.FromFetchXml(save.AudienceFetchXml, customerTable);
                return null;
            }
            catch (AudienceFilterException invalid)
            {
                return invalid.Message;
            }
        }
    }
}
