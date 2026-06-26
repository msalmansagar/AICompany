using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Builds <see cref="FieldDefinition"/> instances from raw CRM entities.
    /// Extracted from <see cref="FormJsonGenerator"/> to keep each class under 400 lines.
    /// </summary>
    internal sealed class FieldBuilder
    {
        private readonly ITranslationResolver _translationResolver;
        private readonly FormRawData _rawData;

        /// <summary>
        /// Initialises a new <see cref="FieldBuilder"/> for a single generation run.
        /// </summary>
        /// <param name="translationResolver">Resolves translated strings.</param>
        /// <param name="rawData">All raw entity data for the form being built.</param>
        public FieldBuilder(ITranslationResolver translationResolver, FormRawData rawData)
        {
            _translationResolver = translationResolver ?? throw new ArgumentNullException("translationResolver");
            _rawData = rawData ?? throw new ArgumentNullException("rawData");
        }

        /// <summary>
        /// Returns all fields belonging to the given section, ordered by display order.
        /// </summary>
        /// <param name="sectionId">GUID of the parent section.</param>
        /// <returns>Ordered list of field definitions.</returns>
        public List<FieldDefinition> BuildFields(Guid sectionId)
        {
            if (_rawData.Fields == null) return new List<FieldDefinition>();
            return _rawData.Fields
                .Where(f => EntityHelper.GetLookupId(f, "_qdb_form_section_id_value") == sectionId)
                .OrderBy(f => f.GetAttributeValue<int>("qdb_display_order"))
                .Select(BuildField)
                .ToList();
        }

        private FieldDefinition BuildField(Entity field)
        {
            var fieldId = field.Id;
            var fieldTypeCode = EntityHelper.GetOptionSetValue(field, "qdb_field_type");
            var fieldTypeStr = PicklistMapper.ToFieldType(fieldTypeCode);

            return new FieldDefinition
            {
                Id = fieldId,
                SectionId = EntityHelper.GetLookupId(field, "_qdb_form_section_id_value"),
                FieldType = fieldTypeStr,
                SchemaName = field.GetAttributeValue<string>("qdb_schema_name"),
                Label = Resolve(fieldId, "qdb_form_field", "qdb_label", field.GetAttributeValue<string>("qdb_label")),
                Placeholder = Resolve(fieldId, "qdb_form_field", "qdb_placeholder", field.GetAttributeValue<string>("qdb_placeholder")),
                Tooltip = Resolve(fieldId, "qdb_form_field", "qdb_tooltip", field.GetAttributeValue<string>("qdb_tooltip")),
                Prefix = field.GetAttributeValue<string>("qdb_prefix"),
                Suffix = field.GetAttributeValue<string>("qdb_suffix"),
                DefaultValue = field.GetAttributeValue<string>("qdb_default_value"),
                DisplayOrder = field.GetAttributeValue<int>("qdb_display_order"),
                ColumnSpan = PicklistMapper.ToColumnCount(EntityHelper.GetOptionSetValue(field, "qdb_column_span")),
                IsRequired = field.GetAttributeValue<bool>("qdb_is_required"),
                IsReadonly = field.GetAttributeValue<bool>("qdb_is_readonly"),
                IsHidden = field.GetAttributeValue<bool>("qdb_is_hidden"),
                IsVisible = field.GetAttributeValue<bool>("qdb_is_visible"),
                CurrencyCode = field.GetAttributeValue<string>("qdb_currency_code"),
                DecimalPlaces = field.Contains("qdb_decimal_places") ? (int?)field.GetAttributeValue<int>("qdb_decimal_places") : null,
                MaxRows = field.Contains("qdb_max_rows") ? (int?)field.GetAttributeValue<int>("qdb_max_rows") : null,
                ComponentKey = field.GetAttributeValue<string>("qdb_component_key"),
                TrueLabel = Resolve(fieldId, "qdb_form_field", "qdb_true_label", field.GetAttributeValue<string>("qdb_true_label")),
                FalseLabel = Resolve(fieldId, "qdb_form_field", "qdb_false_label", field.GetAttributeValue<string>("qdb_false_label")),
                BoolRenderStyle = PicklistMapper.ToBoolRenderStyle(EntityHelper.GetOptionSetValue(field, "qdb_bool_render_style")),
                MultiselectRenderStyle = PicklistMapper.ToMultiselectRenderStyle(EntityHelper.GetOptionSetValue(field, "qdb_multiselect_render_style")),
                RadioRenderStyle = PicklistMapper.ToRadioRenderStyle(EntityHelper.GetOptionSetValue(field, "qdb_radio_render_style")),
                OptionSourceEntity = field.GetAttributeValue<string>("qdb_option_source_entity"),
                OptionSourceAttribute = field.GetAttributeValue<string>("qdb_option_source_attribute"),
                InfoCardStyle = PicklistMapper.ToInfoCardStyle(EntityHelper.GetOptionSetValue(field, "qdb_info_card_style")),
                InfoCardTitle = Resolve(fieldId, "qdb_form_field", "qdb_info_card_title", field.GetAttributeValue<string>("qdb_info_card_title")),
                InfoCardBody = Resolve(fieldId, "qdb_form_field", "qdb_info_card_body", field.GetAttributeValue<string>("qdb_info_card_body")),
                InfoCardIcon = field.GetAttributeValue<string>("qdb_info_card_icon"),
                InfoCardDownloadUrl = field.GetAttributeValue<string>("qdb_info_card_download_url"),
                InfoCardDownloadLabel = Resolve(fieldId, "qdb_form_field", "qdb_info_card_download_label", field.GetAttributeValue<string>("qdb_info_card_download_label")),
                InfoCardDownloadIcon = field.GetAttributeValue<string>("qdb_info_card_download_icon"),
                FileDownloadLabel = Resolve(fieldId, "qdb_form_field", "qdb_file_download_label", field.GetAttributeValue<string>("qdb_file_download_label")),
                FileDownloadIcon = field.GetAttributeValue<string>("qdb_file_download_icon"),
                UploadDocumentSetting = field.GetAttributeValue<string>("qdb_upload_document_setting"),
                DownloadDocumentSetting = field.GetAttributeValue<string>("qdb_download_document_setting"),
                Options = BuildOptions(fieldId),
                LookupConfig = BuildLookupConfig(fieldId),
                FileUploadConfig = BuildFileUploadConfig(field, fieldTypeStr),
                GridConfig = BuildGridConfig(field, fieldId),
                ValidationRules = BuildValidationRules(fieldId),
                BusinessRules = BuildBusinessRules(fieldId)
            };
        }

        private List<OptionValue> BuildOptions(Guid fieldId)
        {
            if (_rawData.OptionValues == null) return new List<OptionValue>();
            return _rawData.OptionValues
                .Where(o => EntityHelper.GetLookupId(o, "_qdb_form_field_id_value") == fieldId)
                .OrderBy(o => o.GetAttributeValue<int>("qdb_display_order"))
                .Select(o => new OptionValue
                {
                    Value = o.GetAttributeValue<string>("qdb_value"),
                    Label = o.GetAttributeValue<string>("qdb_label"),
                    DisplayOrder = o.GetAttributeValue<int>("qdb_display_order"),
                    IsDefault = o.GetAttributeValue<bool>("qdb_is_default"),
                    ParentOptionValue = o.GetAttributeValue<string>("qdb_parent_option_value"),
                    IsActive = o.GetAttributeValue<bool>("qdb_is_active"),
                    Description = o.GetAttributeValue<string>("qdb_description"),
                    IconName = o.GetAttributeValue<string>("qdb_icon_name"),
                    Notes = o.GetAttributeValue<string>("qdb_notes"),
                    OptionRecordId = o.Id != Guid.Empty ? (Guid?)o.Id : null
                })
                .ToList();
        }

        private LookupConfig BuildLookupConfig(Guid fieldId)
        {
            if (_rawData.LookupConfigs == null) return null;
            var config = _rawData.LookupConfigs.FirstOrDefault(l => EntityHelper.GetLookupId(l, "_qdb_form_field_id_value") == fieldId);
            if (config == null) return null;
            return new LookupConfig
            {
                Id = config.Id,
                EntityLogicalName = config.GetAttributeValue<string>("qdb_entity_logical_name"),
                DisplayAttribute = config.GetAttributeValue<string>("qdb_display_attribute"),
                ValueAttribute = config.GetAttributeValue<string>("qdb_value_attribute"),
                FilterExpression = config.GetAttributeValue<string>("qdb_filter_expression"),
                SearchMinChars = config.GetAttributeValue<int>("qdb_search_min_chars"),
                MaxResults = config.GetAttributeValue<int>("qdb_max_results"),
                DependsOnFieldId = EntityHelper.GetNullableLookupId(config, "_qdb_depends_on_field_id_value"),
                DependsOnFilterTemplate = config.GetAttributeValue<string>("qdb_depends_on_filter_template")
            };
        }

        private FileUploadConfig BuildFileUploadConfig(Entity field, string fieldType)
        {
            if (fieldType != "file") return null;
            var mimeTypesRaw = field.GetAttributeValue<string>("qdb_allowed_mime_types") ?? string.Empty;
            var extensionsRaw = field.GetAttributeValue<string>("qdb_allowed_file_extensions") ?? string.Empty;
            return new FileUploadConfig
            {
                Id = Guid.NewGuid(),
                FieldId = field.Id,
                AllowedMimeTypes = SplitCsv(mimeTypesRaw),
                MaxFileSizeBytes = field.Contains("qdb_max_file_size_bytes") ? field.GetAttributeValue<long>("qdb_max_file_size_bytes") : 0L,
                Destination = field.GetAttributeValue<string>("qdb_destination"),
                MaxFiles = field.Contains("qdb_max_files") ? field.GetAttributeValue<int>("qdb_max_files") : 1,
                DocumentType = field.GetAttributeValue<string>("qdb_document_type"),
                AllowedFileExtensions = SplitCsv(extensionsRaw)
            };
        }

        private GridFieldConfig BuildGridConfig(Entity field, Guid fieldId)
        {
            var gridTargetEntity = field.GetAttributeValue<string>("qdb_grid_target_entity");
            if (string.IsNullOrEmpty(gridTargetEntity)) return null;
            var gridMode = PicklistMapper.ToGridMode(EntityHelper.GetOptionSetValue(field, "qdb_grid_mode"));
            return new GridFieldConfig
            {
                GridMode = gridMode,
                Mode = gridMode,
                TargetEntity = gridTargetEntity,
                EntityName = gridTargetEntity,
                SavedViewId = field.GetAttributeValue<string>("qdb_grid_saved_view_id"),
                SelectionMode = PicklistMapper.ToSelectionMode(EntityHelper.GetOptionSetValue(field, "qdb_grid_selection_mode")),
                MinRows = field.Contains("qdb_grid_min_rows") ? field.GetAttributeValue<int>("qdb_grid_min_rows") : 0,
                MaxRows = field.Contains("qdb_grid_max_rows") ? field.GetAttributeValue<int>("qdb_grid_max_rows") : 0,
                FilterExpression = field.GetAttributeValue<string>("qdb_grid_filter_expression"),
                DependsOnFieldId = EntityHelper.GetNullableLookupId(field, "qdb_grid_depends_on_field_id"),
                DependsOnFilterTemplate = field.GetAttributeValue<string>("qdb_grid_depends_on_filter_template"),
                ColumnConfigs = BuildGridColumns(fieldId)
            };
        }

        private List<GridColumnConfig> BuildGridColumns(Guid fieldId)
        {
            if (_rawData.GridColumnConfigs == null) return new List<GridColumnConfig>();
            return _rawData.GridColumnConfigs
                .Where(c => EntityHelper.GetLookupId(c, "_qdb_form_field_id_value") == fieldId)
                .OrderBy(c => c.GetAttributeValue<int>("qdb_display_order"))
                .Select(BuildGridColumn)
                .ToList();
        }

        private GridColumnConfig BuildGridColumn(Entity column)
        {
            var optionsJson = column.GetAttributeValue<string>("qdb_column_options_json") ?? "[]";
            List<GridColumnOptionValue> options;
            try { options = JsonConvert.DeserializeObject<List<GridColumnOptionValue>>(optionsJson) ?? new List<GridColumnOptionValue>(); }
            catch { options = new List<GridColumnOptionValue>(); }

            return new GridColumnConfig
            {
                ColumnId = column.Id,
                DisplayOrder = column.GetAttributeValue<int>("qdb_display_order"),
                ColumnLabel = column.GetAttributeValue<string>("qdb_column_label"),
                TargetAttribute = column.GetAttributeValue<string>("qdb_column_attribute"),
                ColumnFieldType = column.GetAttributeValue<string>("qdb_column_field_type"),
                Options = options
            };
        }

        private List<ValidationRule> BuildValidationRules(Guid fieldId)
        {
            if (_rawData.ValidationRules == null) return new List<ValidationRule>();
            return _rawData.ValidationRules
                .Where(r => EntityHelper.GetLookupId(r, "_qdb_form_field_id_value") == fieldId)
                .OrderBy(r => r.GetAttributeValue<int>("qdb_priority"))
                .Select(r => new ValidationRule
                {
                    Id = r.Id,
                    FieldId = fieldId,
                    RuleType = PicklistMapper.ToValidationRuleType(EntityHelper.GetOptionSetValue(r, "qdb_rule_type")),
                    ErrorMessage = r.GetAttributeValue<string>("qdb_error_message"),
                    MinLength = r.Contains("qdb_min_length") ? (int?)r.GetAttributeValue<int>("qdb_min_length") : null,
                    MaxLength = r.Contains("qdb_max_length") ? (int?)r.GetAttributeValue<int>("qdb_max_length") : null,
                    MinValue = r.Contains("qdb_min_value") ? (decimal?)r.GetAttributeValue<decimal>("qdb_min_value") : null,
                    MaxValue = r.Contains("qdb_max_value") ? (decimal?)r.GetAttributeValue<decimal>("qdb_max_value") : null,
                    RegexPattern = r.GetAttributeValue<string>("qdb_regex_pattern"),
                    CompareToFieldId = EntityHelper.GetNullableLookupId(r, "_qdb_compare_to_field_id_value"),
                    CompareToValue = r.GetAttributeValue<string>("qdb_compare_to_value"),
                    CustomExpression = r.GetAttributeValue<string>("qdb_custom_expression"),
                    RuleTemplateId = EntityHelper.GetNullableLookupId(r, "_qdb_rule_template_id_value"),
                    IsActive = r.GetAttributeValue<bool>("qdb_is_active"),
                    Priority = r.GetAttributeValue<int>("qdb_priority")
                })
                .ToList();
        }

        private List<BusinessRule> BuildBusinessRules(Guid fieldId)
        {
            if (_rawData.BusinessRules == null) return new List<BusinessRule>();
            return _rawData.BusinessRules
                .Where(r => EntityHelper.GetNullableLookupId(r, "_qdb_target_field_id_value") == fieldId)
                .OrderBy(r => r.GetAttributeValue<int>("qdb_priority"))
                .Select(BuildBusinessRule)
                .ToList();
        }

        private BusinessRule BuildBusinessRule(Entity rule)
        {
            var conditionsJson = rule.GetAttributeValue<string>("qdb_conditions_json") ?? "[]";
            List<RuleCondition> conditions;
            try { conditions = JsonConvert.DeserializeObject<List<RuleCondition>>(conditionsJson) ?? new List<RuleCondition>(); }
            catch { conditions = new List<RuleCondition>(); }

            return new BusinessRule
            {
                Id = rule.Id,
                Name = rule.GetAttributeValue<string>("qdb_name"),
                Description = rule.GetAttributeValue<string>("qdb_description"),
                Conditions = conditions,
                ConditionsLogic = rule.GetAttributeValue<string>("qdb_conditions_logic"),
                Action = PicklistMapper.ToBusinessRuleAction(EntityHelper.GetOptionSetValue(rule, "qdb_action")),
                TargetFieldId = EntityHelper.GetNullableLookupId(rule, "_qdb_target_field_id_value"),
                TargetSectionId = EntityHelper.GetNullableLookupId(rule, "_qdb_target_section_id_value"),
                TargetTabId = EntityHelper.GetNullableLookupId(rule, "_qdb_target_tab_id_value"),
                ActionValue = rule.GetAttributeValue<string>("qdb_action_value"),
                Priority = rule.GetAttributeValue<int>("qdb_priority"),
                IsActive = rule.GetAttributeValue<bool>("qdb_is_active")
            };
        }

        private string Resolve(Guid recordId, string entityName, string fieldName, string fallback)
        {
            return _translationResolver.Resolve(_rawData.TranslationMap, entityName, recordId, fieldName, fallback);
        }

        private static List<string> SplitCsv(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return new List<string>();
            return raw.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                      .Select(s => s.Trim())
                      .Where(s => !string.IsNullOrEmpty(s))
                      .ToList();
        }
    }
}
