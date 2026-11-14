using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Shared columns, links and row mapping for survey source, trigger and setup reads.</summary>
    internal static class SurveyConfigMapping
    {
        public const string SetupAlias = "setup";

        public static readonly string[] SourceColumns =
            { "qdb_table_logical_name", "qdb_customer_lookup_field", "qdb_type_field", "qdb_status_field", "qdb_origin_field", "qdb_origin_digital_values", "qdb_counts_toward_milestones" };

        /// <summary>Inner join to the trigger's setup, limited to active setups.</summary>
        public static LinkEntity BuildActiveSetupLink()
        {
            var link = new LinkEntity("qdb_survey_trigger", "qdb_survey_setup", "qdb_survey_setup_id", "qdb_survey_setupid", JoinOperator.Inner)
            {
                EntityAlias = SetupAlias,
                Columns = new ColumnSet("qdb_survey_setupid", "qdb_form_code", "qdb_delivery_digital", "qdb_delivery_legacy", "qdb_active_from", "qdb_active_to", "qdb_expiry_days"),
            };
            link.LinkCriteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            return link;
        }

        public static SurveySource MapSource(Entity row)
        {
            var fields = new SourceFields
            {
                CustomerLookup = row.GetAttributeValue<string>("qdb_customer_lookup_field"),
                Type = row.GetAttributeValue<string>("qdb_type_field"),
                Status = row.GetAttributeValue<string>("qdb_status_field") ?? "statuscode",
                Origin = row.GetAttributeValue<string>("qdb_origin_field"),
                DigitalOriginValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_origin_digital_values")),
                CountsTowardMilestones = row.GetAttributeValue<bool?>("qdb_counts_toward_milestones") ?? false,
            };
            return new SurveySource(row.Id, row.GetAttributeValue<string>("qdb_table_logical_name"), fields);
        }

        /// <summary>A trigger row joined to its setup through <see cref="BuildActiveSetupLink"/>.</summary>
        public static SurveyTrigger MapTrigger(Entity row) => new SurveyTrigger
        {
            Id = row.Id,
            Kind = (TriggerKind)row.GetAttributeValue<OptionSetValue>("qdb_trigger_kind").Value,
            StatusValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_status_values")),
            TypeValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_type_values")),
            Priority = row.GetAttributeValue<int?>("qdb_priority"),
            FatigueAction = (FatigueAction?)row.GetAttributeValue<OptionSetValue>("qdb_fatigue_action")?.Value,
            CreatedOn = row.GetAttributeValue<DateTime>("createdon"),
            Milestone = MapMilestone(row),
            Setup = MapSetup(row),
        };

        private static MilestoneSettings MapMilestone(Entity row) => new MilestoneSettings
        {
            EveryN = row.GetAttributeValue<int?>("qdb_milestone_every_n") ?? 5,
            TypeValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_milestone_type_values")),
            StatusValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_milestone_status_values")),
            CountFrom = row.GetAttributeValue<DateTime?>("qdb_milestone_count_from"),
            SkipReached = row.GetAttributeValue<bool?>("qdb_milestone_skip_reached") ?? true,
        };

        private static SurveySetup MapSetup(Entity row) => new SurveySetup
        {
            Id = (Guid)Aliased(row, "qdb_survey_setupid"),
            FormCode = (string)Aliased(row, "qdb_form_code"),
            DeliveryDigital = ToDelivery(Aliased(row, "qdb_delivery_digital")),
            DeliveryLegacy = ToDelivery(Aliased(row, "qdb_delivery_legacy")),
            ActiveFrom = (DateTime?)Aliased(row, "qdb_active_from"),
            ActiveTo = (DateTime?)Aliased(row, "qdb_active_to"),
            ExpiryDays = (int?)Aliased(row, "qdb_expiry_days"),
        };

        private static object Aliased(Entity row, string attribute) =>
            row.GetAttributeValue<AliasedValue>(SetupAlias + "." + attribute)?.Value;

        // An unset delivery means the column default, Portal (manifest default).
        private static DeliveryChoice ToDelivery(object value) =>
            value is OptionSetValue option ? (DeliveryChoice)option.Value : DeliveryChoice.Portal;
    }
}
