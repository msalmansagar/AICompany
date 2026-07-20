using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
                .Where(f => EntityHelper.GetLookupId(f, "qdb_form_section_id") == sectionId)
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
                SectionId = EntityHelper.GetLookupId(field, "qdb_form_section_id"),
                FieldType = fieldTypeStr,
                SchemaName = field.GetAttributeValue<string>("qdb_schema_name"),
                Label = Resolve(fieldId, "qdb_form_field", "qdb_label", field.GetAttributeValue<string>("qdb_label")),
                Placeholder = Resolve(fieldId, "qdb_form_field", "qdb_placeholder", field.GetAttributeValue<string>("qdb_placeholder")),
                Tooltip = Resolve(fieldId, "qdb_form_field", "qdb_tooltip", field.GetAttributeValue<string>("qdb_tooltip")),
                Prefix = Resolve(fieldId, "qdb_form_field", "qdb_prefix", field.GetAttributeValue<string>("qdb_prefix")),
                Suffix = Resolve(fieldId, "qdb_form_field", "qdb_suffix", field.GetAttributeValue<string>("qdb_suffix")),
                DefaultValue = field.GetAttributeValue<string>("qdb_default_value"),
                DisplayOrder = field.GetAttributeValue<int>("qdb_display_order"),
                ColumnSpan = PicklistMapper.ToColumnCount(EntityHelper.GetOptionSetValue(field, "qdb_column_span")),
                IsRequired = field.GetAttributeValue<bool>("qdb_is_required"),
                IsReadonly = field.GetAttributeValue<bool>("qdb_is_readonly"),
                IsHidden = field.GetAttributeValue<bool>("qdb_is_hidden"),
                IsVisible = !field.GetAttributeValue<bool>("qdb_is_hidden"),
                CurrencyCode = field.GetAttributeValue<string>("qdb_currency_code"),
                DecimalPlaces = field.Contains("qdb_decimal_places") ? (int?)field.GetAttributeValue<int>("qdb_decimal_places") : null,
                MaxRows = field.Contains("qdb_max_rows") ? (int?)field.GetAttributeValue<int>("qdb_max_rows") : null,
                ComponentKey = field.GetAttributeValue<string>("qdb_component_key"),
                TrueLabel = Resolve(fieldId, "qdb_form_field", "qdb_true_label", field.GetAttributeValue<string>("qdb_true_label")),
                FalseLabel = Resolve(fieldId, "qdb_form_field", "qdb_false_label", field.GetAttributeValue<string>("qdb_false_label")),
                BoolRenderStyle = PicklistMapper.ToBoolRenderStyle(EntityHelper.GetOptionSetValue(field, "qdb_boolean_render_style")),
                MultiselectRenderStyle = PicklistMapper.ToMultiselectRenderStyle(EntityHelper.GetOptionSetValue(field, "qdb_multiselect_render_style")),
                RadioRenderStyle = PicklistMapper.ToRadioRenderStyle(EntityHelper.GetOptionSetValue(field, "qdb_radio_render_style")),
                OptionSourceEntity = field.GetAttributeValue<string>("qdb_option_source_entity"),
                OptionSourceAttribute = field.GetAttributeValue<string>("qdb_option_source_attribute"),
                InfoCardStyle = PicklistMapper.ToInfoCardStyle(EntityHelper.GetOptionSetValue(field, "qdb_info_card_style")),
                InfoCardTitle = Resolve(fieldId, "qdb_form_field", "qdb_info_card_title", field.GetAttributeValue<string>("qdb_info_card_title")),
                InfoCardBody = Resolve(fieldId, "qdb_form_field", "qdb_info_card_body", field.GetAttributeValue<string>("qdb_info_card_body")),
                InfoCardIcon = field.GetAttributeValue<string>("qdb_info_card_icon"),
                InfoCardListType = field.GetAttributeValue<string>("qdb_info_card_list_type"),
                InfoCardListMarker = field.GetAttributeValue<string>("qdb_info_card_list_marker"),
                InfoCardDownloadUrl = field.GetAttributeValue<string>("qdb_info_card_download_url"),
                InfoCardDownloadLabel = Resolve(fieldId, "qdb_form_field", "qdb_info_card_download_label", field.GetAttributeValue<string>("qdb_info_card_download_label")),
                InfoCardDownloadIcon = field.GetAttributeValue<string>("qdb_info_card_download_icon"),
                FileDownloadLabel = Resolve(fieldId, "qdb_form_field", "qdb_file_download_label", field.GetAttributeValue<string>("qdb_file_download_label")),
                FileDownloadIcon = field.GetAttributeValue<string>("qdb_file_download_icon"),
                UploadDocumentSetting = field.GetAttributeValue<string>("qdb_upload_document_setting"),
                DownloadDocumentSetting = field.GetAttributeValue<string>("qdb_download_document_setting"),
                // DFE-FBE-001: Label field — translatable static content + optional source binding.
                StaticContent = Resolve(fieldId, "qdb_form_field", "qdb_static_content", field.GetAttributeValue<string>("qdb_static_content")),
                SourceFieldSchemaName = field.GetAttributeValue<string>("qdb_source_field_schema_name"),
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
                .Where(o => EntityHelper.GetLookupId(o, "qdb_form_field_id") == fieldId)
                .OrderBy(o => o.GetAttributeValue<int>("qdb_display_order"))
                .Select(o => new OptionValue
                {
                    Value = o.GetAttributeValue<string>("qdb_value"),
                    Label = Resolve(o.Id, "qdb_form_option_value", "qdb_label", o.GetAttributeValue<string>("qdb_label")),
                    DisplayOrder = o.GetAttributeValue<int>("qdb_display_order"),
                    IsDefault = o.GetAttributeValue<bool>("qdb_is_default"),
                    ParentOptionValue = o.GetAttributeValue<string>("qdb_parent_option_value"),
                    IsActive = o.GetAttributeValue<bool>("qdb_is_active"),
                    Description = Resolve(o.Id, "qdb_form_option_value", "qdb_description", o.GetAttributeValue<string>("qdb_description")),
                    IconName = o.GetAttributeValue<string>("qdb_icon_name"),
                    Notes = Resolve(o.Id, "qdb_form_option_value", "qdb_notes", o.GetAttributeValue<string>("qdb_notes")),
                    OptionRecordId = o.Id != Guid.Empty ? (Guid?)o.Id : null
                })
                .ToList();
        }

        private LookupConfig BuildLookupConfig(Guid fieldId)
        {
            if (_rawData.LookupConfigs == null) return null;
            var config = _rawData.LookupConfigs.FirstOrDefault(l => EntityHelper.GetLookupId(l, "qdb_form_field_id") == fieldId);
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
                DependsOnFieldId = EntityHelper.GetNullableLookupId(config, "qdb_depends_on_field_id"),
                DependsOnFilterTemplate = config.GetAttributeValue<string>("qdb_depends_on_filter_template")
            };
        }

        private FileUploadConfig BuildFileUploadConfig(Entity field, string fieldType)
        {
            if (fieldType != "file") return null;
            var extensionCodes = EntityHelper.GetMultiSelectValues(field, "qdb_allowed_file_extensions");
            return new FileUploadConfig
            {
                Id = field.Id,
                FieldId = field.Id,
                AllowedMimeTypes = ResolveAllowedMimeTypes(extensionCodes, field.GetAttributeValue<string>("qdb_allowed_mime_types")),
                MaxFileSizeBytes = ResolveMaxFileSizeBytes(field),
                Destination = "crmNotes",
                MaxFiles = field.Contains("qdb_max_files") ? field.GetAttributeValue<int>("qdb_max_files") : 1,
                DocumentType = EntityHelper.GetOptionSetValue(field, "qdb_document_type"),
                AllowedFileExtensions = extensionCodes.Count > 0 ? extensionCodes : null
            };
        }

        private static long ResolveMaxFileSizeBytes(Entity field)
        {
            var sizeMb = field.Contains("qdb_max_file_size_mb") ? field.GetAttributeValue<int>("qdb_max_file_size_mb") : 10;
            return (long)sizeMb * 1024 * 1024;
        }

        private static List<string> ResolveAllowedMimeTypes(List<int> extensionCodes, string legacyMimeJson)
        {
            if (extensionCodes.Count > 0)
                return extensionCodes
                    .SelectMany(code => FileExtensionMimeMap.ContainsKey(code) ? FileExtensionMimeMap[code] : new string[0])
                    .ToList();
            return ParseLegacyMimeTypes(legacyMimeJson);
        }

        private static List<string> ParseLegacyMimeTypes(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return DefaultMimeTypes.ToList();
            try
            {
                var parsed = JsonConvert.DeserializeObject<List<string>>(json);
                return parsed ?? DefaultMimeTypes.ToList();
            }
            catch
            {
                return DefaultMimeTypes.ToList();
            }
        }

        private GridFieldConfig BuildGridConfig(Entity field, Guid fieldId)
        {
            if (!field.Contains("qdb_grid_mode")) return null;
            var gridMode = PicklistMapper.ToGridMode(EntityHelper.GetOptionSetValue(field, "qdb_grid_mode"));
            var entityName = field.GetAttributeValue<string>("qdb_grid_entity_name");
            return new GridFieldConfig
            {
                GridMode = gridMode,
                Mode = gridMode,
                TargetEntity = entityName ?? string.Empty,
                EntityName = entityName,
                SavedViewId = field.GetAttributeValue<string>("qdb_grid_saved_view_id"),
                SelectionMode = PicklistMapper.ToSelectionMode(EntityHelper.GetOptionSetValue(field, "qdb_selection_mode")),
                MinRows = field.Contains("qdb_grid_min_rows") ? field.GetAttributeValue<int>("qdb_grid_min_rows") : 0,
                MaxRows = field.Contains("qdb_max_rows") ? field.GetAttributeValue<int>("qdb_max_rows") : 200,
                FilterExpression = field.GetAttributeValue<string>("qdb_grid_filter_expression"),
                DependsOnFilterTemplate = field.GetAttributeValue<string>("qdb_grid_depends_on_filter_template"),
                ColumnConfigs = BuildGridColumns(fieldId)
            };
        }

        private List<GridColumnConfig> BuildGridColumns(Guid fieldId)
        {
            if (_rawData.GridColumnConfigs == null) return new List<GridColumnConfig>();
            return _rawData.GridColumnConfigs
                .Where(c => EntityHelper.GetLookupId(c, "qdb_form_field_id") == fieldId)
                .OrderBy(c => c.GetAttributeValue<int>("qdb_display_order"))
                .Select(BuildGridColumn)
                .ToList();
        }

        private GridColumnConfig BuildGridColumn(Entity column)
        {
            var config = new GridColumnConfig
            {
                ColumnId = column.Id,
                DisplayOrder = column.GetAttributeValue<int>("qdb_display_order"),
                ColumnLabel = Resolve(column.Id, "qdb_grid_column_config", "qdb_column_label", column.GetAttributeValue<string>("qdb_column_label")),
                TargetAttribute = column.GetAttributeValue<string>("qdb_column_attribute"),
                ColumnFieldType = column.GetAttributeValue<string>("qdb_column_field_type"),
                Options = new List<GridColumnOptionValue>()
            };
            ApplyColumnOptionsJson(config, column.GetAttributeValue<string>("qdb_column_options_json"));
            return config;
        }

        // The grid-column options JSON has TWO shapes (mirrors the designer encoder and
        // the Node backend decoder): a bare array of { value, label } (options only), OR a
        // v2 object { v:2, options:[...], filterType, lookupTargetEntity, lookupDisplayAttribute }
        // carrying filter/lookup metadata. Parse BOTH — a bare-array-only parse silently
        // dropped v2 columns' options AND all their lookup config, so lookup columns rendered
        // blank in-CRM (worked in local dev, which decodes both).
        private static void ApplyColumnOptionsJson(GridColumnConfig config, string optionsJson)
        {
            if (string.IsNullOrWhiteSpace(optionsJson)) return;
            try
            {
                var token = JToken.Parse(optionsJson);
                if (token is JArray arr)
                {
                    config.Options = arr.ToObject<List<GridColumnOptionValue>>() ?? config.Options;
                }
                else if (token is JObject obj)
                {
                    if (obj["options"] is JArray v2Options)
                        config.Options = v2Options.ToObject<List<GridColumnOptionValue>>() ?? config.Options;
                    config.FilterType = (string)obj["filterType"];
                    config.LookupTargetEntity = (string)obj["lookupTargetEntity"];
                    config.LookupDisplayAttribute = (string)obj["lookupDisplayAttribute"];
                    config.LookupValueAttribute = (string)obj["lookupValueAttribute"];
                }
            }
            catch { /* malformed options JSON — leave defaults (empty options, no filter meta) */ }
        }

        private List<ValidationRule> BuildValidationRules(Guid fieldId)
        {
            if (_rawData.ValidationRules == null) return new List<ValidationRule>();
            return _rawData.ValidationRules
                .Where(r => EntityHelper.GetLookupId(r, "qdb_form_field_id") == fieldId)
                .OrderBy(r => r.GetAttributeValue<int>("qdb_priority"))
                .Select(r => new ValidationRule
                {
                    Id = r.Id,
                    FieldId = fieldId,
                    RuleType = PicklistMapper.ToValidationRuleType(EntityHelper.GetOptionSetValue(r, "qdb_rule_type")),
                    ErrorMessage = Resolve(r.Id, "qdb_form_validation_rule", "qdb_error_message", r.GetAttributeValue<string>("qdb_error_message")),
                    MinLength = r.Contains("qdb_min_length") ? (int?)r.GetAttributeValue<int>("qdb_min_length") : null,
                    MaxLength = r.Contains("qdb_max_length") ? (int?)r.GetAttributeValue<int>("qdb_max_length") : null,
                    MinValue = r.Contains("qdb_min_value") ? (decimal?)r.GetAttributeValue<decimal>("qdb_min_value") : null,
                    MaxValue = r.Contains("qdb_max_value") ? (decimal?)r.GetAttributeValue<decimal>("qdb_max_value") : null,
                    RegexPattern = r.GetAttributeValue<string>("qdb_regex_pattern"),
                    CompareToFieldId = EntityHelper.GetNullableLookupId(r, "qdb_compare_to_field_id"),
                    CompareToValue = r.GetAttributeValue<string>("qdb_compare_to_value"),
                    CustomExpression = r.GetAttributeValue<string>("qdb_custom_expression"),
                    RuleTemplateId = EntityHelper.GetNullableLookupId(r, "qdb_rule_template_id"),
                    IsActive = r.GetAttributeValue<bool>("qdb_is_active"),
                    Priority = r.GetAttributeValue<int>("qdb_priority")
                })
                .ToList();
        }

        private List<BusinessRule> BuildBusinessRules(Guid fieldId)
        {
            if (_rawData.BusinessRules == null) return new List<BusinessRule>();
            return _rawData.BusinessRules
                .Where(r => EntityHelper.GetNullableLookupId(r, "qdb_target_field_id") == fieldId)
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
                ConditionsLogic = PicklistMapper.ToLogicalOperator(EntityHelper.GetOptionSetValue(rule, "qdb_conditions_logic")),
                Action = PicklistMapper.ToBusinessRuleAction(EntityHelper.GetOptionSetValue(rule, "qdb_action")),
                TargetFieldId = EntityHelper.GetNullableLookupId(rule, "qdb_target_field_id"),
                TargetSectionId = EntityHelper.GetNullableLookupId(rule, "qdb_target_section_id"),
                TargetTabId = EntityHelper.GetNullableLookupId(rule, "qdb_target_tab_id"),
                ActionValue = rule.GetAttributeValue<string>("qdb_action_value"),
                Priority = rule.GetAttributeValue<int>("qdb_priority"),
                IsActive = rule.GetAttributeValue<bool>("qdb_is_active")
            };
        }

        private string Resolve(Guid recordId, string entityName, string fieldName, string fallback)
        {
            return _translationResolver.Resolve(_rawData.TranslationMap, entityName, recordId, fieldName, fallback);
        }

        /// <summary>
        /// Maps each qdb_allowed_file_extensions option value to its MIME type(s).
        /// Mirrors the runtime contract produced by the live metadata service so the
        /// cached JSON is byte-equivalent to the on-demand assembly path.
        /// </summary>
        private static readonly Dictionary<int, string[]> FileExtensionMimeMap = new Dictionary<int, string[]>
        {
            { 100000000, new[] { "application/pdf" } },
            { 100000001, new[] { "image/jpeg" } },
            { 100000002, new[] { "image/png" } },
            { 100000003, new[] { "image/gif" } },
            { 100000004, new[] { "image/webp" } },
            { 100000005, new[] { "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } },
            { 100000006, new[] { "application/msword" } },
            { 100000007, new[] { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } },
            { 100000008, new[] { "application/vnd.ms-excel" } },
            { 100000009, new[] { "application/vnd.openxmlformats-officedocument.presentationml.presentation" } },
            { 100000010, new[] { "text/plain" } },
            { 100000011, new[] { "text/csv" } },
            { 100000012, new[] { "application/zip" } },
            { 100000013, new[] { "video/mp4" } },
            { 100000014, new[] { "audio/mpeg" } }
        };

        private static readonly string[] DefaultMimeTypes =
        {
            "application/pdf", "image/jpeg", "image/png", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        };
    }
}
