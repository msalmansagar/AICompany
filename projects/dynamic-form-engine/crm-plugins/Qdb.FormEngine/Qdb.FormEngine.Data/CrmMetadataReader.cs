using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Data
{
    /// <summary>
    /// Reads all form metadata from Dynamics CRM using the Organisation Service SDK.
    /// Each entity is retrieved by a targeted QueryExpression to keep query surface minimal.
    /// </summary>
    public sealed class CrmMetadataReader : IMetadataReader
    {
        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;

        /// <summary>
        /// Initialises a new instance of <see cref="CrmMetadataReader"/>.
        /// </summary>
        /// <param name="service">The CRM organisation service used for all queries.</param>
        /// <param name="tracing">Optional tracing service; degraded optional-schema reads are logged to it.</param>
        public CrmMetadataReader(IOrganizationService service, ITracingService tracing = null)
        {
            _service = service ?? throw new ArgumentNullException("service");
            _tracing = tracing;
        }

        /// <summary>
        /// Reads all raw CRM data required to generate a form definition for the given form code.
        /// Does not populate TranslationMap — call <see cref="ReadTranslationMap"/> separately per language.
        /// </summary>
        /// <param name="formCode">The qdb_form_code value identifying the form.</param>
        /// <returns>Populated <see cref="FormRawData"/> with all entity collections except TranslationMap.</returns>
        public FormRawData ReadFormRawData(string formCode)
        {
            if (string.IsNullOrWhiteSpace(formCode))
                throw new ArgumentException("formCode must not be null or empty.", "formCode");

            var formEntity = FetchFormDefinition(formCode);
            var formId = formEntity.Id;

            var tabs = FetchTabs(formId);
            var tabIds = tabs.Select(t => t.Id).ToList();

            var sections = FetchSections(tabIds);
            var sectionIds = sections.Select(s => s.Id).ToList();

            var fields = FetchFields(sectionIds);
            var fieldIds = fields.Select(f => f.Id).ToList();

            var languages = FetchLanguages();

            var formDesign = FetchFormDesign(formId);
            var formDesignId = formDesign != null ? formDesign.Id : Guid.Empty;
            var themeId = formDesign != null ? GetLookupId(formDesign, "qdb_theme_id") : Guid.Empty;

            return new FormRawData
            {
                FormEntity = formEntity,
                Tabs = tabs,
                Sections = sections,
                Fields = fields,
                OptionValues = FetchOptionValues(fieldIds),
                ValidationRules = FetchValidationRules(fieldIds),
                LookupConfigs = FetchLookupConfigs(fieldIds),
                BarConfigs = FetchBarConfigs(fieldIds),
                SubmissionMappings = FetchSubmissionMappings(formId),
                Buttons = FetchButtons(formId),
                ScopedButtons = FetchScopedButtons(formId),
                BusinessRules = FetchBusinessRules(formId),
                GridColumnConfigs = FetchGridColumnConfigs(fieldIds),
                InfoCardScreens = FetchInfoCardScreens(formId),
                InfoCardSections = FetchInfoCardSections(formId),
                InfoCardItems = FetchInfoCardItems(formId),
                FormDesign = formDesign,
                Theme = themeId != Guid.Empty ? FetchTheme(themeId) : null,
                SectionDesigns = FetchSectionDesigns(sectionIds),
                FieldDesigns = FetchFieldDesigns(fieldIds),
                ButtonDesigns = FetchButtonDesigns(formId),
                LayoutGrids = formDesignId != Guid.Empty ? FetchLayoutGrids(formDesignId) : new List<Entity>(),
                TranslationMap = new TranslationMap(),
                Languages = languages
            };
        }

        /// <summary>
        /// Builds a TranslationMap for the specified record IDs and language code
        /// by querying qdb_translation.
        /// </summary>
        /// <param name="recordIds">GUIDs of all records that need translations.</param>
        /// <param name="languageCode">Two-letter language code (e.g. "en", "ar").</param>
        /// <returns>Populated <see cref="TranslationMap"/>.</returns>
        public TranslationMap ReadTranslationMap(List<Guid> recordIds, string languageCode)
        {
            if (recordIds == null || recordIds.Count == 0)
                return new TranslationMap();

            var query = new QueryExpression("qdb_translation")
            {
                ColumnSet = new ColumnSet("qdb_entity_name", "qdb_record_id", "qdb_field_name", "qdb_translated_value"),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_language_code", ConditionOperator.Equal, languageCode);
            // qdb_record_id is a string column; match against the standard "D" GUID format
            // ("xxxxxxxx-xxxx-..."), not raw Guid values, or the In filter matches nothing.
            var recordIdStrings = recordIds.Select(id => (object)id.ToString()).ToArray();
            query.Criteria.AddCondition("qdb_record_id", ConditionOperator.In, recordIdStrings);

            var results = RetrieveAll(query);
            var map = new TranslationMap();
            foreach (var row in results)
            {
                var entityName = row.GetAttributeValue<string>("qdb_entity_name");
                var recordIdRaw = row.GetAttributeValue<string>("qdb_record_id");
                var fieldName = row.GetAttributeValue<string>("qdb_field_name");
                var value = row.GetAttributeValue<string>("qdb_translated_value");

                Guid recordId;
                if (!string.IsNullOrEmpty(entityName) && Guid.TryParse(recordIdRaw, out recordId) && !string.IsNullOrEmpty(fieldName))
                    map.Add(entityName, recordId, fieldName, value);
            }
            return map;
        }

        private Entity FetchFormDefinition(string formCode)
        {
            var query = new QueryExpression("qdb_form_definition")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_form_code", ConditionOperator.Equal, formCode);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var results = _service.RetrieveMultiple(query);
            if (results.Entities.Count == 0)
                throw new InvalidOperationException(string.Format("Form definition not found for form code: {0}", formCode));
            return results.Entities[0];
        }

        private List<Entity> FetchTabs(Guid formId)
        {
            var query = new QueryExpression("qdb_form_tab")
            {
                ColumnSet = new ColumnSet("qdb_label", "qdb_icon_name", "qdb_display_order", "qdb_is_visible",
                    "qdb_requires_previous_tab_complete", "qdb_hide_tab_bar", "qdb_form_definition_id",
                    "qdb_description", "qdb_is_summary_tab",
                    "qdb_require_submit_confirmation", "qdb_submit_confirmation_label",
                    "qdb_submit_confirmation_message"),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchSections(List<Guid> tabIds)
        {
            if (tabIds == null || tabIds.Count == 0) return new List<Entity>();
            var query = new QueryExpression("qdb_form_section")
            {
                ColumnSet = new ColumnSet("qdb_label", "qdb_description", "qdb_display_order", "qdb_columns",
                    "qdb_is_collapsible", "qdb_is_collapsed_by_default", "qdb_is_visible", "qdb_form_tab_id",
                    "qdb_icon_name"),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("qdb_form_tab_id", ConditionOperator.In, tabIds.Cast<object>().ToArray());
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchFields(List<Guid> sectionIds)
        {
            if (sectionIds == null || sectionIds.Count == 0) return new List<Entity>();
            var query = new QueryExpression("qdb_form_field")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("qdb_form_section_id", ConditionOperator.In, sectionIds.Cast<object>().ToArray());
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchOptionValues(List<Guid> fieldIds)
        {
            if (fieldIds == null || fieldIds.Count == 0) return new List<Entity>();
            var query = new QueryExpression("qdb_form_option_value")
            {
                ColumnSet = new ColumnSet("qdb_value", "qdb_label", "qdb_display_order", "qdb_is_default",
                    "qdb_parent_option_value", "qdb_is_active", "qdb_description", "qdb_icon_name",
                    "qdb_notes", "qdb_form_field_id"),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("qdb_form_field_id", ConditionOperator.In, fieldIds.Cast<object>().ToArray());
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchValidationRules(List<Guid> fieldIds)
        {
            if (fieldIds == null || fieldIds.Count == 0) return new List<Entity>();
            var query = new QueryExpression("qdb_form_validation_rule")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_form_field_id", ConditionOperator.In, fieldIds.Cast<object>().ToArray());
            query.AddOrder("qdb_priority", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchLookupConfigs(List<Guid> fieldIds)
        {
            if (fieldIds == null || fieldIds.Count == 0) return new List<Entity>();
            var query = new QueryExpression("qdb_form_lookup_config")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_form_field_id", ConditionOperator.In, fieldIds.Cast<object>().ToArray());
            return RetrieveAll(query);
        }

        /// <summary>
        /// Bar source configs (DFE-BARSRC-001). The table is provisioned separately, so a
        /// missing one yields no configs and every bar keeps its field-based values rather
        /// than failing the whole publish.
        /// </summary>
        private List<Entity> FetchBarConfigs(List<Guid> fieldIds)
        {
            if (fieldIds == null || fieldIds.Count == 0) return new List<Entity>();
            try
            {
                var query = new QueryExpression("qdb_form_bar_config")
                {
                    ColumnSet = new ColumnSet(true),
                    NoLock = true
                };
                query.Criteria.AddCondition("qdb_form_field_id", ConditionOperator.In, fieldIds.Cast<object>().ToArray());
                return RetrieveAll(query);
            }
            catch (Exception)
            {
                return new List<Entity>();
            }
        }

        private List<Entity> FetchSubmissionMappings(Guid formId)
        {
            var query = new QueryExpression("qdb_form_submission_mapping")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
            return RetrieveAll(query);
        }

        private List<Entity> FetchButtons(Guid formId)
        {
            var query = new QueryExpression("qdb_form_button")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        // DFE-BTN-001: tab/section scoped buttons. Degrades to an empty list if the entity
        // is not provisioned (the schema deploy is gated) so form generation never fails
        // over a buttons sub-query.
        private List<Entity> FetchScopedButtons(Guid formId)
        {
            try
            {
                var query = new QueryExpression("qdb_form_scoped_button")
                {
                    ColumnSet = new ColumnSet(true),
                    NoLock = true
                };
                query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
                query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
                query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
                query.AddOrder("qdb_display_order", OrderType.Ascending);
                return RetrieveAll(query);
            }
            catch (Exception ex)
            {
                _tracing?.Trace("CrmMetadataReader: optional-schema read degraded (schema not deployed?): {0}", ex.Message);
                return new List<Entity>();
            }
        }

        private List<Entity> FetchBusinessRules(Guid formId)
        {
            var query = new QueryExpression("qdb_form_business_rule")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
            query.AddOrder("qdb_priority", OrderType.Ascending);
            return RetrieveAll(query);
        }

        // DFE-STYLE-001: design entities. Each degrades to null/empty if the design schema
        // is not provisioned (the deploy is gated) so form generation never fails over styling.

        private Entity FetchFormDesign(Guid formId)
        {
            try
            {
                var query = new QueryExpression("qdb_form_design")
                {
                    ColumnSet = new ColumnSet(true),
                    NoLock = true,
                    TopCount = 1
                };
                query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
                query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
                query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
                var results = _service.RetrieveMultiple(query);
                return results.Entities.Count > 0 ? results.Entities[0] : null;
            }
            catch (Exception ex)
            {
                _tracing?.Trace("CrmMetadataReader: optional-schema read degraded (schema not deployed?): {0}", ex.Message);
                return null;
            }
        }

        private Entity FetchTheme(Guid themeId)
        {
            try
            {
                return _service.Retrieve("qdb_theme", themeId, new ColumnSet(true));
            }
            catch (Exception ex)
            {
                _tracing?.Trace("CrmMetadataReader: optional-schema read degraded (schema not deployed?): {0}", ex.Message);
                return null;
            }
        }

        private List<Entity> FetchSectionDesigns(List<Guid> sectionIds)
        {
            if (sectionIds == null || sectionIds.Count == 0) return new List<Entity>();
            try
            {
                var query = new QueryExpression("qdb_section_design")
                {
                    ColumnSet = new ColumnSet(true),
                    NoLock = true
                };
                query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
                query.Criteria.AddCondition("qdb_form_section_id", ConditionOperator.In, sectionIds.Cast<object>().ToArray());
                return RetrieveAll(query);
            }
            catch (Exception ex)
            {
                _tracing?.Trace("CrmMetadataReader: optional-schema read degraded (schema not deployed?): {0}", ex.Message);
                return new List<Entity>();
            }
        }

        private List<Entity> FetchFieldDesigns(List<Guid> fieldIds)
        {
            if (fieldIds == null || fieldIds.Count == 0) return new List<Entity>();
            try
            {
                var query = new QueryExpression("qdb_field_design")
                {
                    ColumnSet = new ColumnSet(true),
                    NoLock = true
                };
                query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
                query.Criteria.AddCondition("qdb_form_field_id", ConditionOperator.In, fieldIds.Cast<object>().ToArray());
                return RetrieveAll(query);
            }
            catch (Exception ex)
            {
                _tracing?.Trace("CrmMetadataReader: optional-schema read degraded (schema not deployed?): {0}", ex.Message);
                return new List<Entity>();
            }
        }

        private List<Entity> FetchButtonDesigns(Guid formId)
        {
            try
            {
                var query = new QueryExpression("qdb_button_design")
                {
                    ColumnSet = new ColumnSet(true),
                    NoLock = true
                };
                query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
                query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
                return RetrieveAll(query);
            }
            catch (Exception ex)
            {
                _tracing?.Trace("CrmMetadataReader: optional-schema read degraded (schema not deployed?): {0}", ex.Message);
                return new List<Entity>();
            }
        }

        private List<Entity> FetchLayoutGrids(Guid formDesignId)
        {
            try
            {
                var query = new QueryExpression("qdb_layout_grid")
                {
                    ColumnSet = new ColumnSet(true),
                    NoLock = true
                };
                query.Criteria.AddCondition("qdb_form_design_id", ConditionOperator.Equal, formDesignId);
                return RetrieveAll(query);
            }
            catch (Exception ex)
            {
                _tracing?.Trace("CrmMetadataReader: optional-schema read degraded (schema not deployed?): {0}", ex.Message);
                return new List<Entity>();
            }
        }

        private static Guid GetLookupId(Entity entity, string attributeName)
        {
            if (entity == null || !entity.Contains(attributeName)) return Guid.Empty;
            var reference = entity.GetAttributeValue<EntityReference>(attributeName);
            return reference != null ? reference.Id : Guid.Empty;
        }

        private List<Entity> FetchGridColumnConfigs(List<Guid> fieldIds)
        {
            if (fieldIds == null || fieldIds.Count == 0) return new List<Entity>();
            var query = new QueryExpression("qdb_grid_column_config")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_is_visible", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_form_field_id", ConditionOperator.In, fieldIds.Cast<object>().ToArray());
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchInfoCardScreens(Guid formId)
        {
            var query = new QueryExpression("qdb_info_card_screen")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchInfoCardSections(Guid formId)
        {
            // Join via screen to limit to this form's screens
            var screenQuery = new QueryExpression("qdb_info_card_section")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            screenQuery.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var screenLink = screenQuery.AddLink("qdb_info_card_screen", "qdb_info_card_screen_id", "qdb_info_card_screenid", JoinOperator.Inner);
            screenLink.LinkCriteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
            screenLink.LinkCriteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            screenQuery.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(screenQuery);
        }

        private List<Entity> FetchInfoCardItems(Guid formId)
        {
            var query = new QueryExpression("qdb_info_card_item")
            {
                ColumnSet = new ColumnSet(true),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var sectionLink = query.AddLink("qdb_info_card_section", "qdb_info_card_section_id", "qdb_info_card_sectionid", JoinOperator.Inner);
            sectionLink.LinkCriteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var screenLink = sectionLink.AddLink("qdb_info_card_screen", "qdb_info_card_screen_id", "qdb_info_card_screenid", JoinOperator.Inner);
            screenLink.LinkCriteria.AddCondition("qdb_form_definition_id", ConditionOperator.Equal, formId);
            query.AddOrder("qdb_display_order", OrderType.Ascending);
            return RetrieveAll(query);
        }

        private List<Entity> FetchLanguages()
        {
            var query = new QueryExpression("qdb_language_config")
            {
                ColumnSet = new ColumnSet("qdb_language_code", "qdb_lcid", "qdb_is_default"),
                NoLock = true
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            return RetrieveAll(query);
        }

        private List<Entity> RetrieveAll(QueryExpression query)
        {
            var results = new List<Entity>();
            query.PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 };
            while (true)
            {
                var response = _service.RetrieveMultiple(query);
                results.AddRange(response.Entities);
                if (!response.MoreRecords) break;
                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = response.PagingCookie;
            }
            return results;
        }
    }
}
