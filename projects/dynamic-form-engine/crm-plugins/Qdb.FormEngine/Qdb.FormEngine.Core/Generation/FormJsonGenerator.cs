using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
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
                CreatedAt = form.Contains("createdon") ? (DateTime?)form.GetAttributeValue<DateTime>("createdon") : null,
                ModifiedAt = form.Contains("modifiedon") ? (DateTime?)form.GetAttributeValue<DateTime>("modifiedon") : null,
                Tabs = BuildTabs(rawData, formId, fieldBuilder),
                SubmissionMappings = BuildSubmissionMappings(rawData, formId),
                Buttons = BuildButtons(rawData, formId),
                InfoCards = BuildInfoCardScreens(rawData, formId)
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
                DisplayOrder = tab.GetAttributeValue<int>("qdb_display_order"),
                IsVisible = EntityHelper.GetBoolOrTrue(tab, "qdb_is_visible"),
                RequiresPreviousTabComplete = tab.GetAttributeValue<bool>("qdb_requires_previous_tab_complete"),
                HideTabBar = tab.GetAttributeValue<bool>("qdb_hide_tab_bar"),
                Sections = BuildSections(rawData, tabId, fieldBuilder)
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
                DisplayOrder = section.GetAttributeValue<int>("qdb_display_order"),
                Columns = PicklistMapper.ToColumnCount(EntityHelper.GetOptionSetValue(section, "qdb_columns")),
                IsCollapsible = section.GetAttributeValue<bool>("qdb_is_collapsible"),
                IsCollapsedByDefault = section.GetAttributeValue<bool>("qdb_is_collapsed_by_default"),
                IsVisible = EntityHelper.GetBoolOrTrue(section, "qdb_is_visible"),
                Fields = fieldBuilder.BuildFields(sectionId)
            };
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
