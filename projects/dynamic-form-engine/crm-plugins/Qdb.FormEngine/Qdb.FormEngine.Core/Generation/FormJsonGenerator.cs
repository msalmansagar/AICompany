using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json.Linq;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Maps all raw CRM entity records in <see cref="FormRawData"/> to a
    /// fully hydrated <see cref="FormDefinitionModel"/>. Picklist codes are
    /// converted via <see cref="PicklistMapper"/>. Translated strings are
    /// resolved via <see cref="ITranslationResolver"/>.
    /// Field-level mapping is delegated to <see cref="FieldBuilder"/>.
    /// </summary>
    public sealed class FormJsonGenerator : IFormJsonGenerator
    {
        private readonly ITranslationResolver _translationResolver;
        private readonly ITracingService _tracingService;

        /// <summary>
        /// Initialises a new instance of <see cref="FormJsonGenerator"/>.
        /// </summary>
        /// <param name="translationResolver">Resolves translated strings from the translation map.</param>
        /// <param name="tracingService">CRM tracing service for diagnostic output.</param>
        public FormJsonGenerator(ITranslationResolver translationResolver, ITracingService tracingService)
        {
            _translationResolver = translationResolver ?? throw new ArgumentNullException("translationResolver");
            _tracingService = tracingService ?? throw new ArgumentNullException("tracingService");
        }

        /// <summary>
        /// Generates the complete form definition model from raw CRM data.
        /// </summary>
        /// <param name="rawData">All raw entity records for this form.</param>
        /// <param name="languageCode">Target language code for translation resolution.</param>
        /// <returns>A fully populated <see cref="FormDefinitionModel"/>.</returns>
        public FormDefinitionModel Generate(FormRawData rawData, string languageCode)
        {
            if (rawData == null) throw new ArgumentNullException("rawData");
            if (rawData.FormEntity == null) throw new ArgumentException("FormEntity must not be null.", "rawData");

            _tracingService.Trace("FormJsonGenerator: building model for language {0}", languageCode);

            var form = rawData.FormEntity;
            var formId = form.Id;
            var fieldBuilder = new FieldBuilder(_translationResolver, rawData);

            return new FormDefinitionModel
            {
                Id = formId,
                FormCode = form.GetAttributeValue<string>("qdb_form_code"),
                Title = Resolve(rawData, "qdb_form_definition", formId, "qdb_title", form.GetAttributeValue<string>("qdb_title")),
                Description = Resolve(rawData, "qdb_form_definition", formId, "qdb_description", form.GetAttributeValue<string>("qdb_description")),
                Status = PicklistMapper.ToFormStatus(EntityHelper.GetOptionSetValue(form, "qdb_status")),
                Version = form.GetAttributeValue<int>("qdb_version"),
                AllowSaveDraft = form.GetAttributeValue<bool>("qdb_allow_save_draft"),
                DraftExpiryDays = form.Contains("qdb_draft_expiry_days") ? (int?)form.GetAttributeValue<int>("qdb_draft_expiry_days") : null,
                PowerAutomateFlowId = form.GetAttributeValue<string>("qdb_power_automate_flow_id"),
                ConfirmationMessage = Resolve(rawData, "qdb_form_definition", formId, "qdb_confirmation_message", form.GetAttributeValue<string>("qdb_confirmation_message")),
                ConfirmationRecordRefAttribute = form.GetAttributeValue<string>("qdb_confirmation_record_ref_attribute"),
                AccessGroupId = form.GetAttributeValue<string>("qdb_access_group_id"),
                AllowInfocardSkip = form.GetAttributeValue<bool>("qdb_allow_infocard_skip"),
                InfocardCountsInProgress = form.GetAttributeValue<bool>("qdb_infocard_counts_in_progress"),
                InfocardBackLabel = Resolve(rawData, "qdb_form_definition", formId, "qdb_infocard_back_label", form.GetAttributeValue<string>("qdb_infocard_back_label")),
                InfocardContinueLabel = Resolve(rawData, "qdb_form_definition", formId, "qdb_infocard_continue_label", form.GetAttributeValue<string>("qdb_infocard_continue_label")),
                InfocardStartLabel = Resolve(rawData, "qdb_form_definition", formId, "qdb_infocard_start_label", form.GetAttributeValue<string>("qdb_infocard_start_label")),
                InfocardSkipLabel = Resolve(rawData, "qdb_form_definition", formId, "qdb_infocard_skip_label", form.GetAttributeValue<string>("qdb_infocard_skip_label")),
                ShowSummaryStep = form.GetAttributeValue<bool>("qdb_show_summary_step"),
                SummaryMode = PicklistMapper.ToSummaryMode(EntityHelper.GetOptionSetValue(form, "qdb_summary_mode")),
                ShowProgressBar = form.GetAttributeValue<bool>("qdb_show_progress_bar") ? (bool?)true : null,
                CreatedAt = form.Contains("createdon") ? (DateTime?)form.GetAttributeValue<DateTime>("createdon") : null,
                ModifiedAt = form.Contains("modifiedon") ? (DateTime?)form.GetAttributeValue<DateTime>("modifiedon") : null,
                Tabs = BuildTabs(rawData, formId, fieldBuilder),
                SubmissionMappings = BuildSubmissionMappings(rawData, formId),
                Buttons = BuildButtons(rawData, formId),
                InfoCards = BuildInfoCardScreens(rawData, formId),
                Design = BuildDesign(rawData, formId)
            };
        }

        private string Resolve(FormRawData rawData, string entityName, Guid recordId, string fieldName, string fallback)
        {
            return _translationResolver.Resolve(rawData.TranslationMap, entityName, recordId, fieldName, fallback);
        }

        private List<TabDefinition> BuildTabs(FormRawData rawData, Guid formId, FieldBuilder fieldBuilder)
        {
            if (rawData.Tabs == null) return new List<TabDefinition>();
            return rawData.Tabs
                .Where(t => EntityHelper.GetLookupId(t, "qdb_form_definition_id") == formId)
                .OrderBy(t => t.GetAttributeValue<int>("qdb_display_order"))
                .Select(t => BuildTab(rawData, t, fieldBuilder))
                .ToList();
        }

        private TabDefinition BuildTab(FormRawData rawData, Entity tab, FieldBuilder fieldBuilder)
        {
            var tabId = tab.Id;
            return new TabDefinition
            {
                Id = tabId,
                FormDefinitionId = EntityHelper.GetLookupId(tab, "qdb_form_definition_id"),
                Label = Resolve(rawData, "qdb_form_tab", tabId, "qdb_label", tab.GetAttributeValue<string>("qdb_label")),
                IconName = tab.GetAttributeValue<string>("qdb_icon_name"),
                Description = Resolve(rawData, "qdb_form_tab", tabId, "qdb_description", tab.GetAttributeValue<string>("qdb_description")),
                IsSummaryTab = tab.GetAttributeValue<bool>("qdb_is_summary_tab") ? (bool?)true : null,
                DisplayOrder = tab.GetAttributeValue<int>("qdb_display_order"),
                IsVisible = EntityHelper.GetBoolOrTrue(tab, "qdb_is_visible"),
                RequiresPreviousTabComplete = tab.GetAttributeValue<bool>("qdb_requires_previous_tab_complete"),
                HideTabBar = tab.GetAttributeValue<bool>("qdb_hide_tab_bar"),
                Sections = BuildSections(rawData, tabId, fieldBuilder),
                Buttons = BuildScopedButtons(rawData, "tab", tabId)
            };
        }

        private List<SectionDefinition> BuildSections(FormRawData rawData, Guid tabId, FieldBuilder fieldBuilder)
        {
            if (rawData.Sections == null) return new List<SectionDefinition>();
            return rawData.Sections
                .Where(s => EntityHelper.GetLookupId(s, "qdb_form_tab_id") == tabId)
                .OrderBy(s => s.GetAttributeValue<int>("qdb_display_order"))
                .Select(s => BuildSection(rawData, s, fieldBuilder))
                .ToList();
        }

        private SectionDefinition BuildSection(FormRawData rawData, Entity section, FieldBuilder fieldBuilder)
        {
            var sectionId = section.Id;
            return new SectionDefinition
            {
                Id = sectionId,
                TabId = EntityHelper.GetLookupId(section, "qdb_form_tab_id"),
                Label = Resolve(rawData, "qdb_form_section", sectionId, "qdb_label", section.GetAttributeValue<string>("qdb_label")),
                Description = Resolve(rawData, "qdb_form_section", sectionId, "qdb_description", section.GetAttributeValue<string>("qdb_description")),
                IconName = section.GetAttributeValue<string>("qdb_icon_name"),
                DisplayOrder = section.GetAttributeValue<int>("qdb_display_order"),
                Columns = PicklistMapper.ToColumnCount(EntityHelper.GetOptionSetValue(section, "qdb_columns")),
                IsCollapsible = section.GetAttributeValue<bool>("qdb_is_collapsible"),
                IsCollapsedByDefault = section.GetAttributeValue<bool>("qdb_is_collapsed_by_default"),
                IsVisible = EntityHelper.GetBoolOrTrue(section, "qdb_is_visible"),
                Fields = fieldBuilder.BuildFields(sectionId),
                Buttons = BuildScopedButtons(rawData, "section", sectionId)
            };
        }

        // DFE-BTN-001: maps qdb_form_scoped_button records placed on a tab/section.
        // Returns null when empty so a button-less tab/section omits the "buttons" key
        // (the cache JSON for existing forms is byte-identical). Malformed action configs
        // drop the button rather than failing the whole form (mirrors the backend reader).
        private List<ScopedButton> BuildScopedButtons(FormRawData rawData, string scope, Guid placementId)
        {
            if (rawData.ScopedButtons == null) return null;
            var lookupName = scope == "section" ? "qdb_section_id" : "qdb_tab_id";
            var buttons = rawData.ScopedButtons
                .Where(b => EntityHelper.GetLookupId(b, lookupName) == placementId)
                .OrderBy(b => b.GetAttributeValue<int>("qdb_display_order"))
                .Select(b => BuildScopedButton(rawData, b, scope, placementId))
                .Where(b => b != null)
                .ToList();
            return buttons.Count > 0 ? buttons : null;
        }

        private ScopedButton BuildScopedButton(FormRawData rawData, Entity button, string scope, Guid placementId)
        {
            var action = BuildScopedButtonAction(
                button.GetAttributeValue<string>("qdb_action_type"),
                button.GetAttributeValue<string>("qdb_action_config_json"));
            if (action == null) return null;

            return new ScopedButton
            {
                Id = button.Id,
                PlacementScope = scope,
                PlacementId = placementId,
                Label = Resolve(rawData, "qdb_form_scoped_button", button.Id, "qdb_label", button.GetAttributeValue<string>("qdb_label")),
                DisplayOrder = button.GetAttributeValue<int>("qdb_display_order"),
                IsPrimary = button.GetAttributeValue<bool>("qdb_is_primary"),
                IsVisible = EntityHelper.GetBoolOrTrue(button, "qdb_is_visible"),
                ConfirmationRequired = button.GetAttributeValue<bool>("qdb_confirm_required"),
                ConfirmationMessage = Resolve(rawData, "qdb_form_scoped_button", button.Id, "qdb_confirm_message", button.GetAttributeValue<string>("qdb_confirm_message")),
                Action = action,
                IsActive = true
            };
        }

        // Parses the action JSON memo into the discriminated-union object the runtimes expect,
        // forcing the type to the record's action type. Returns null for an invalid/missing config.
        private object BuildScopedButtonAction(string actionType, string configJson)
        {
            if (string.IsNullOrEmpty(actionType)) return null;
            if (actionType == "saveDraft") return new JObject { ["type"] = "saveDraft" };
            if (string.IsNullOrEmpty(configJson)) return null;

            try
            {
                var obj = JObject.Parse(configJson);
                obj["type"] = actionType;
                if (actionType == "finalSubmit" && obj["extraParams"] == null) obj["extraParams"] = new JArray();
                return obj;
            }
            catch (Exception ex)
            {
                _tracingService.Trace("FormJsonGenerator: dropping scoped button with invalid action JSON: {0}", ex.Message);
                return null;
            }
        }

        private List<SubmissionMapping> BuildSubmissionMappings(FormRawData rawData, Guid formId)
        {
            if (rawData.SubmissionMappings == null) return new List<SubmissionMapping>();
            return rawData.SubmissionMappings
                .Where(m => EntityHelper.GetLookupId(m, "qdb_form_definition_id") == formId)
                .Select(m => new SubmissionMapping
                {
                    Id = m.Id,
                    FormDefinitionId = formId,
                    FieldId = EntityHelper.GetLookupId(m, "qdb_form_field_id"),
                    TargetEntityLogicalName = m.GetAttributeValue<string>("qdb_target_entity_logical_name"),
                    TargetAttributeLogicalName = m.GetAttributeValue<string>("qdb_target_attribute_logical_name"),
                    IsMappedToChildEntity = m.GetAttributeValue<bool>("qdb_is_child_entity"),
                    ChildEntityRelationshipName = m.GetAttributeValue<string>("qdb_child_entity_relationship_name"),
                    TransformExpression = m.GetAttributeValue<string>("qdb_transform_expression"),
                    IsActive = m.GetAttributeValue<bool>("qdb_is_active")
                })
                .ToList();
        }

        private List<FormButton> BuildButtons(FormRawData rawData, Guid formId)
        {
            if (rawData.Buttons == null) return new List<FormButton>();
            return rawData.Buttons
                .Where(b => EntityHelper.GetLookupId(b, "qdb_form_definition_id") == formId)
                .OrderBy(b => b.GetAttributeValue<int>("qdb_display_order"))
                .Select(b => new FormButton
                {
                    Id = b.Id,
                    FormDefinitionId = formId,
                    Label = Resolve(rawData, "qdb_form_button", b.Id, "qdb_label", b.GetAttributeValue<string>("qdb_label")),
                    Action = PicklistMapper.ToButtonAction(EntityHelper.GetOptionSetValue(b, "qdb_action")),
                    DisplayOrder = b.GetAttributeValue<int>("qdb_display_order"),
                    IsVisible = EntityHelper.GetBoolOrTrue(b, "qdb_is_visible"),
                    IsPrimary = b.GetAttributeValue<bool>("qdb_is_primary"),
                    ConfirmationRequired = b.GetAttributeValue<bool>("qdb_confirmation_required"),
                    ConfirmationMessage = Resolve(rawData, "qdb_form_button", b.Id, "qdb_confirmation_message", b.GetAttributeValue<string>("qdb_confirmation_message")),
                    IsActive = b.GetAttributeValue<bool>("qdb_is_active")
                })
                .ToList();
        }

        // DFE-STYLE-001: assembles the design payload from the design entities.
        // Returns null when the form has no active design so design-less forms keep a
        // byte-identical render-cache JSON. Mirrors the cloud DesignAssembler mapping.
        private DesignPayload BuildDesign(FormRawData rawData, Guid formId)
        {
            if (rawData.FormDesign == null) return null;

            return new DesignPayload
            {
                Theme = BuildTheme(rawData.Theme),
                FormDesign = BuildFormDesign(rawData.FormDesign),
                SectionDesigns = BuildSectionDesigns(rawData),
                FieldDesigns = BuildFieldDesigns(rawData),
                ButtonDesigns = BuildButtonDesigns(rawData, formId),
                LayoutGrid = BuildLayoutGrids(rawData)
            };
        }

        private ThemeDefinition BuildTheme(Entity theme)
        {
            if (theme == null) return null;
            return new ThemeDefinition
            {
                Id = theme.Id.ToString(),
                ThemeCode = theme.GetAttributeValue<string>("qdb_theme_code"),
                ThemeName = theme.GetAttributeValue<string>("qdb_theme_name"),
                PrimaryColor = theme.GetAttributeValue<string>("qdb_primary_color"),
                SecondaryColor = theme.GetAttributeValue<string>("qdb_secondary_color"),
                BackgroundColor = theme.GetAttributeValue<string>("qdb_background_color"),
                SurfaceColor = theme.GetAttributeValue<string>("qdb_surface_color"),
                TextPrimaryColor = theme.GetAttributeValue<string>("qdb_text_primary_color"),
                TextSecondaryColor = theme.GetAttributeValue<string>("qdb_text_secondary_color"),
                BorderColor = theme.GetAttributeValue<string>("qdb_border_color"),
                ErrorColor = theme.GetAttributeValue<string>("qdb_error_color"),
                SuccessColor = theme.GetAttributeValue<string>("qdb_success_color"),
                WarningColor = theme.GetAttributeValue<string>("qdb_warning_color"),
                FontFamily = theme.GetAttributeValue<string>("qdb_font_family"),
                FontUrl = theme.GetAttributeValue<string>("qdb_font_url"),
                BaseFontSize = theme.GetAttributeValue<string>("qdb_base_font_size"),
                HeadingFontSize = theme.GetAttributeValue<string>("qdb_heading_font_size"),
                LabelFontSize = theme.GetAttributeValue<string>("qdb_label_font_size"),
                InputFontSize = theme.GetAttributeValue<string>("qdb_input_font_size"),
                BorderRadius = theme.GetAttributeValue<string>("qdb_border_radius"),
                ShadowStyle = theme.Contains("qdb_shadow_style")
                    ? DesignPicklistMapper.ToShadowStyle(EntityHelper.GetOptionSetValue(theme, "qdb_shadow_style")) : null,
                SpacingScale = theme.Contains("qdb_spacing_scale")
                    ? DesignPicklistMapper.ToSpacingScale(EntityHelper.GetOptionSetValue(theme, "qdb_spacing_scale")) : null,
                IsDarkMode = theme.GetAttributeValue<bool>("qdb_is_dark_mode"),
                IsActive = EntityHelper.GetBoolOrTrue(theme, "qdb_is_active")
            };
        }

        private FormDesign BuildFormDesign(Entity design)
        {
            return new FormDesign
            {
                Id = design.Id.ToString(),
                FormDefinitionId = NullableIdString(EntityHelper.GetNullableLookupId(design, "qdb_form_definition_id")),
                ThemeId = NullableIdString(EntityHelper.GetNullableLookupId(design, "qdb_theme_id")),
                LayoutType = DesignPicklistMapper.ToLayoutType(EntityHelper.GetOptionSetValue(design, "qdb_layout_type")),
                LabelPosition = DesignPicklistMapper.ToLabelPosition(EntityHelper.GetOptionSetValue(design, "qdb_label_position")),
                SectionStyle = DesignPicklistMapper.ToSectionStyle(EntityHelper.GetOptionSetValue(design, "qdb_section_style")),
                TabStyle = DesignPicklistMapper.ToTabStyle(EntityHelper.GetOptionSetValue(design, "qdb_tab_style")),
                ButtonStyle = DesignPicklistMapper.ToButtonStyle(EntityHelper.GetOptionSetValue(design, "qdb_button_style")),
                AnimationEnabled = EntityHelper.GetBoolOrTrue(design, "qdb_animation_enabled"),
                ResponsiveBehavior = ParseJsonOrNull(design.GetAttributeValue<string>("qdb_responsive_behavior")),
                MaxWidth = design.GetAttributeValue<string>("qdb_max_width"),
                Alignment = DesignPicklistMapper.ToAlignment(EntityHelper.GetOptionSetValue(design, "qdb_alignment")),
                CustomCss = design.GetAttributeValue<string>("qdb_custom_css"),
                StickyActionBar = design.GetAttributeValue<bool>("qdb_sticky_action_bar"),
                SkeletonLoaderEnabled = EntityHelper.GetBoolOrTrue(design, "qdb_skeleton_loader_enabled"),
                IsActive = EntityHelper.GetBoolOrTrue(design, "qdb_is_active")
            };
        }

        private Dictionary<string, SectionDesign> BuildSectionDesigns(FormRawData rawData)
        {
            var result = new Dictionary<string, SectionDesign>();
            if (rawData.SectionDesigns == null) return result;
            foreach (var s in rawData.SectionDesigns)
            {
                var sectionId = EntityHelper.GetLookupId(s, "qdb_form_section_id");
                if (sectionId == Guid.Empty) continue;
                result[sectionId.ToString()] = new SectionDesign
                {
                    Id = s.Id.ToString(),
                    SectionId = sectionId.ToString(),
                    BackgroundColor = s.GetAttributeValue<string>("qdb_background_color"),
                    BorderStyle = s.GetAttributeValue<string>("qdb_border_style"),
                    Padding = s.GetAttributeValue<string>("qdb_padding"),
                    Margin = s.GetAttributeValue<string>("qdb_margin"),
                    ColumnLayout = DesignPicklistMapper.ToColumnLayout(EntityHelper.GetOptionSetValue(s, "qdb_column_layout")),
                    CardStyle = DesignPicklistMapper.ToCardStyle(EntityHelper.GetOptionSetValue(s, "qdb_card_style")),
                    CollapsibleStyle = DesignPicklistMapper.ToCollapseStyle(EntityHelper.GetOptionSetValue(s, "qdb_collapsible_style")),
                    HeaderStyle = ParseJsonOrNull(s.GetAttributeValue<string>("qdb_header_style")),
                    VisibilityAnimation = DesignPicklistMapper.ToAnimationStyle(EntityHelper.GetOptionSetValue(s, "qdb_visibility_animation")),
                    CssClassName = s.GetAttributeValue<string>("qdb_css_class"),
                    IsActive = EntityHelper.GetBoolOrTrue(s, "qdb_is_active")
                };
            }
            return result;
        }

        private Dictionary<string, FieldDesign> BuildFieldDesigns(FormRawData rawData)
        {
            var result = new Dictionary<string, FieldDesign>();
            if (rawData.FieldDesigns == null) return result;
            foreach (var f in rawData.FieldDesigns)
            {
                var fieldId = EntityHelper.GetLookupId(f, "qdb_form_field_id");
                if (fieldId == Guid.Empty) continue;
                result[fieldId.ToString()] = new FieldDesign
                {
                    Id = f.Id.ToString(),
                    FieldId = fieldId.ToString(),
                    LabelStyle = ParseJsonOrNull(f.GetAttributeValue<string>("qdb_label_style")),
                    InputStyle = DesignPicklistMapper.ToInputStyle(EntityHelper.GetOptionSetValue(f, "qdb_input_style")),
                    Width = DesignPicklistMapper.ToFieldWidth(EntityHelper.GetOptionSetValue(f, "qdb_width")),
                    CustomWidth = f.GetAttributeValue<string>("qdb_custom_width"),
                    Height = f.GetAttributeValue<string>("qdb_height"),
                    PlaceholderStyle = ParseJsonOrNull(f.GetAttributeValue<string>("qdb_placeholder_style")),
                    IconPrefix = f.GetAttributeValue<string>("qdb_icon_prefix"),
                    IconSuffix = f.GetAttributeValue<string>("qdb_icon_suffix"),
                    TooltipStyle = ParseJsonOrNull(f.GetAttributeValue<string>("qdb_tooltip_style")),
                    ErrorStyle = ParseJsonOrNull(f.GetAttributeValue<string>("qdb_error_style")),
                    FocusStyle = ParseJsonOrNull(f.GetAttributeValue<string>("qdb_focus_style")),
                    DisabledStyle = ParseJsonOrNull(f.GetAttributeValue<string>("qdb_disabled_style")),
                    CssClassName = f.GetAttributeValue<string>("qdb_field_css_class"),
                    IsActive = EntityHelper.GetBoolOrTrue(f, "qdb_is_active")
                };
            }
            return result;
        }

        private Dictionary<string, ButtonDesign> BuildButtonDesigns(FormRawData rawData, Guid formId)
        {
            var result = new Dictionary<string, ButtonDesign>();
            if (rawData.ButtonDesigns == null) return result;
            foreach (var b in rawData.ButtonDesigns)
            {
                var buttonType = DesignPicklistMapper.ToButtonType(EntityHelper.GetOptionSetValue(b, "qdb_button_type"));
                result[buttonType] = new ButtonDesign
                {
                    Id = b.Id.ToString(),
                    FormDefinitionId = formId.ToString(),
                    ButtonType = buttonType,
                    Color = b.GetAttributeValue<string>("qdb_color"),
                    Size = DesignPicklistMapper.ToButtonSize(EntityHelper.GetOptionSetValue(b, "qdb_size")),
                    BorderRadius = b.GetAttributeValue<string>("qdb_border_radius"),
                    Alignment = DesignPicklistMapper.ToAlignment(EntityHelper.GetOptionSetValue(b, "qdb_alignment")),
                    Icon = b.GetAttributeValue<string>("qdb_icon"),
                    HoverEffect = DesignPicklistMapper.ToHoverEffect(EntityHelper.GetOptionSetValue(b, "qdb_hover_effect")),
                    LoadingStyle = DesignPicklistMapper.ToLoadingStyle(EntityHelper.GetOptionSetValue(b, "qdb_loading_style")),
                    IsActive = EntityHelper.GetBoolOrTrue(b, "qdb_is_active")
                };
            }
            return result;
        }

        private List<LayoutGrid> BuildLayoutGrids(FormRawData rawData)
        {
            if (rawData.LayoutGrids == null) return new List<LayoutGrid>();
            return rawData.LayoutGrids
                .Select(g => new LayoutGrid
                {
                    Id = g.Id.ToString(),
                    FormDesignId = EntityHelper.GetLookupId(g, "qdb_form_design_id").ToString(),
                    FieldId = EntityHelper.GetLookupId(g, "qdb_form_field_id").ToString(),
                    ColumnsTotal = g.GetAttributeValue<int>("qdb_columns_total"),
                    SpanMobile = g.GetAttributeValue<int>("qdb_span_mobile"),
                    SpanTablet = g.GetAttributeValue<int>("qdb_span_tablet"),
                    SpanDesktop = g.GetAttributeValue<int>("qdb_span_desktop")
                })
                .ToList();
        }

        // Parses a Memo JSON column into a JToken so it serialises as a nested object.
        // Returns null for an empty or malformed value (the key is then omitted).
        private object ParseJsonOrNull(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try { return JToken.Parse(json); }
            catch (Exception ex)
            {
                _tracingService.Trace("FormJsonGenerator: dropping malformed design JSON: {0}", ex.Message);
                return null;
            }
        }

        private static string NullableIdString(Guid? id)
        {
            return id.HasValue && id.Value != Guid.Empty ? id.Value.ToString() : null;
        }

        private List<InfoCardScreen> BuildInfoCardScreens(FormRawData rawData, Guid formId)
        {
            if (rawData.InfoCardScreens == null) return new List<InfoCardScreen>();
            return rawData.InfoCardScreens
                .Where(s => EntityHelper.GetLookupId(s, "qdb_form_definition_id") == formId)
                .OrderBy(s => s.GetAttributeValue<int>("qdb_display_order"))
                .Select(s => BuildInfoCardScreen(rawData, s))
                .ToList();
        }

        private InfoCardScreen BuildInfoCardScreen(FormRawData rawData, Entity screen)
        {
            return new InfoCardScreen
            {
                ScreenId = screen.Id,
                DisplayOrder = screen.GetAttributeValue<int>("qdb_display_order"),
                IconUrl = screen.GetAttributeValue<string>("qdb_icon_url"),
                IconAltText = Resolve(rawData, "qdb_info_card_screen", screen.Id, "qdb_icon_alt_text", screen.GetAttributeValue<string>("qdb_icon_alt_text")),
                Heading = Resolve(rawData, "qdb_info_card_screen", screen.Id, "qdb_heading", screen.GetAttributeValue<string>("qdb_heading")),
                SubHeading = Resolve(rawData, "qdb_info_card_screen", screen.Id, "qdb_sub_heading", screen.GetAttributeValue<string>("qdb_sub_heading")),
                Sections = BuildInfoCardSections(rawData, screen.Id)
            };
        }

        private List<InfoCardSection> BuildInfoCardSections(FormRawData rawData, Guid screenId)
        {
            if (rawData.InfoCardSections == null) return new List<InfoCardSection>();
            return rawData.InfoCardSections
                .Where(s => EntityHelper.GetLookupId(s, "qdb_info_card_screen_id") == screenId)
                .OrderBy(s => s.GetAttributeValue<int>("qdb_display_order"))
                .Select(s => new InfoCardSection
                {
                    SectionId = s.Id,
                    DisplayOrder = s.GetAttributeValue<int>("qdb_display_order"),
                    SectionTitle = Resolve(rawData, "qdb_info_card_section", s.Id, "qdb_section_title", s.GetAttributeValue<string>("qdb_section_title")),
                    SectionType = PicklistMapper.ToInfoCardSectionType(EntityHelper.GetOptionSetValue(s, "qdb_section_type")),
                    NoteText = Resolve(rawData, "qdb_info_card_section", s.Id, "qdb_note_text", s.GetAttributeValue<string>("qdb_note_text")),
                    Items = BuildInfoCardItems(rawData, s.Id)
                })
                .ToList();
        }

        private List<InfoCardItem> BuildInfoCardItems(FormRawData rawData, Guid sectionId)
        {
            if (rawData.InfoCardItems == null) return new List<InfoCardItem>();
            return rawData.InfoCardItems
                .Where(i => EntityHelper.GetLookupId(i, "qdb_info_card_section_id") == sectionId)
                .OrderBy(i => i.GetAttributeValue<int>("qdb_display_order"))
                .Select(i => new InfoCardItem
                {
                    ItemId = i.Id,
                    DisplayOrder = i.GetAttributeValue<int>("qdb_display_order"),
                    ItemTitle = Resolve(rawData, "qdb_info_card_item", i.Id, "qdb_item_title", i.GetAttributeValue<string>("qdb_item_title")),
                    ItemDescription = Resolve(rawData, "qdb_info_card_item", i.Id, "qdb_item_description", i.GetAttributeValue<string>("qdb_item_description")),
                    IconReference = i.GetAttributeValue<string>("qdb_icon_reference"),
                    DownloadUrl = i.GetAttributeValue<string>("qdb_download_url")
                })
                .ToList();
        }
    }
}
