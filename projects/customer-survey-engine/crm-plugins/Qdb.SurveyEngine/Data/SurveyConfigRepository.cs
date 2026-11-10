using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads qdb_survey_source, qdb_survey_trigger (+ setup) and qdb_survey_settings.</summary>
    public sealed class SurveyConfigRepository : ISurveyConfigRepository
    {
        private const string SetupAlias = "setup";
        private readonly IOrganizationService _service;

        public SurveyConfigRepository(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public SurveySource FindActiveSource(string tableLogicalName)
        {
            var query = new QueryExpression("qdb_survey_source")
            {
                ColumnSet = new ColumnSet("qdb_table_logical_name", "qdb_customer_lookup_field", "qdb_type_field", "qdb_status_field", "qdb_origin_field", "qdb_origin_digital_values"),
                TopCount = 1,
            };
            query.Criteria.AddCondition("qdb_table_logical_name", ConditionOperator.Equal, tableLogicalName);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row == null ? null : MapSource(row);
        }

        /// <inheritdoc />
        public IReadOnlyList<SurveyTrigger> GetActiveEventTriggers(Guid sourceId)
        {
            var query = new QueryExpression("qdb_survey_trigger")
            {
                ColumnSet = new ColumnSet("qdb_trigger_kind", "qdb_status_values", "qdb_type_values"),
            };
            query.Criteria.AddCondition("qdb_source_id", ConditionOperator.Equal, sourceId);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_trigger_kind", ConditionOperator.In, (int)TriggerKind.Event, (int)TriggerKind.Created);
            query.LinkEntities.Add(BuildActiveSetupLink());
            return _service.RetrieveMultiple(query).Entities.Select(MapTrigger).ToList();
        }

        /// <inheritdoc />
        public SurveySettings GetSettings()
        {
            var query = new QueryExpression("qdb_survey_settings") { ColumnSet = new ColumnSet("qdb_language_field", "qdb_default_language"), TopCount = 1 };
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            var settings = new SurveySettings();
            if (row == null) return settings;
            settings.LanguageField = row.GetAttributeValue<string>("qdb_language_field");
            settings.DefaultLanguage = row.GetAttributeValue<string>("qdb_default_language") ?? settings.DefaultLanguage;
            return settings;
        }

        private static LinkEntity BuildActiveSetupLink()
        {
            var link = new LinkEntity("qdb_survey_trigger", "qdb_survey_setup", "qdb_survey_setup_id", "qdb_survey_setupid", JoinOperator.Inner)
            {
                EntityAlias = SetupAlias,
                Columns = new ColumnSet("qdb_survey_setupid", "qdb_form_code", "qdb_delivery_digital", "qdb_delivery_legacy", "qdb_active_from", "qdb_active_to", "qdb_expiry_days"),
            };
            link.LinkCriteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            return link;
        }

        private static SurveySource MapSource(Entity row)
        {
            var fields = new SourceFields
            {
                CustomerLookup = row.GetAttributeValue<string>("qdb_customer_lookup_field"),
                Type = row.GetAttributeValue<string>("qdb_type_field"),
                Status = row.GetAttributeValue<string>("qdb_status_field") ?? "statuscode",
                Origin = row.GetAttributeValue<string>("qdb_origin_field"),
                DigitalOriginValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_origin_digital_values")),
            };
            return new SurveySource(row.Id, row.GetAttributeValue<string>("qdb_table_logical_name"), fields);
        }

        private static SurveyTrigger MapTrigger(Entity row) => new SurveyTrigger
        {
            Id = row.Id,
            Kind = (TriggerKind)row.GetAttributeValue<OptionSetValue>("qdb_trigger_kind").Value,
            StatusValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_status_values")),
            TypeValues = CodeList.Parse(row.GetAttributeValue<string>("qdb_type_values")),
            Setup = MapSetup(row),
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
