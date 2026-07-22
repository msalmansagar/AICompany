using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json.Linq;
using Moq;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Unit tests for <see cref="FormJsonGenerator"/>.
    /// </summary>
    public sealed class FormJsonGeneratorTests
    {
        private readonly Mock<ITranslationResolver> _translationResolverMock;
        private readonly Mock<ITracingService> _tracingServiceMock;
        private readonly FormJsonGenerator _generator;

        /// <summary>
        /// Initialises mocks and the system under test.
        /// </summary>
        public FormJsonGeneratorTests()
        {
            _translationResolverMock = new Mock<ITranslationResolver>();
            _tracingServiceMock = new Mock<ITracingService>();

            // Default translation resolver passes the English fallback through unchanged.
            _translationResolverMock
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);

            _generator = new FormJsonGenerator(_translationResolverMock.Object, _tracingServiceMock.Object);
        }

        [Fact]
        public void Generate_WithMinimalFormData_ReturnsFormDefinitionWithMatchingId()
        {
            // Arrange
            var formId = Guid.NewGuid();
            var rawData = BuildMinimalFormRawData(formId);

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert
            Assert.Equal(formId, result.Id);
        }

        [Fact]
        public void Generate_WithTranslation_AppliesTranslatedLabel()
        {
            // Arrange
            var formId = Guid.NewGuid();
            var rawData = BuildMinimalFormRawData(formId);
            const string translatedTitle = "Translated Title";

            _translationResolverMock
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), "qdb_form_definition", formId, "qdb_title", It.IsAny<string>()))
                .Returns(translatedTitle);

            // Act
            var result = _generator.Generate(rawData, "ar");

            // Assert
            Assert.Equal(translatedTitle, result.Title);
        }

        [Fact]
        public void Generate_WithHiddenField_FieldIsStillPresent()
        {
            // Arrange — stripping is SecurityStripper's responsibility, not the generator's
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert: the generator does not strip; the hidden field must be present
            Assert.True(result.Tabs.Count > 0);
            Assert.True(result.Tabs[0].Sections.Count > 0);
            var field = result.Tabs[0].Sections[0].Fields[0];
            Assert.True(field.IsHidden, "Generator must preserve hidden field; stripping is SecurityStripper's job.");
        }

        [Fact]
        public void Generate_WithScopedButtons_EmbedsThemOnTabAndSection()
        {
            // Arrange
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            var tabId = rawData.Tabs[0].Id;
            var sectionId = rawData.Sections[0].Id;
            rawData.ScopedButtons = new List<Entity>
            {
                MakeScopedButton(formId, tabId, null, "tab", "Next", "navigate", "{\"target\":\"nextStep\"}"),
                MakeScopedButton(formId, null, sectionId, "section", "Submit", "finalSubmit", "{\"extraParams\":[]}")
            };

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert
            var tab = result.Tabs[0];
            Assert.NotNull(tab.Buttons);
            Assert.Single(tab.Buttons);
            Assert.Equal("Next", tab.Buttons[0].Label);
            Assert.Equal("tab", tab.Buttons[0].PlacementScope);

            var section = tab.Sections[0];
            Assert.NotNull(section.Buttons);
            Assert.Single(section.Buttons);
            Assert.Equal("section", section.Buttons[0].PlacementScope);
        }

        [Fact]
        public void Generate_WithNoScopedButtons_OmitsButtonsProperty()
        {
            // Arrange
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            rawData.ScopedButtons = new List<Entity>();

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert — null so the "buttons" key is omitted (existing forms byte-identical)
            Assert.Null(result.Tabs[0].Buttons);
            Assert.Null(result.Tabs[0].Sections[0].Buttons);
        }

        [Fact]
        public void Generate_WithInvalidActionJson_DropsTheButton()
        {
            // Arrange
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            var tabId = rawData.Tabs[0].Id;
            rawData.ScopedButtons = new List<Entity>
            {
                MakeScopedButton(formId, tabId, null, "tab", "Bad", "navigate", "{not valid json")
            };

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert — the malformed button is dropped, leaving no buttons
            Assert.Null(result.Tabs[0].Buttons);
        }

        [Fact]
        public void Generate_WithButtonConditions_EmbedsVisibleAndEnabledWhen()
        {
            // Arrange — DFE-CBTN-001: per-button visible/enabled condition sets.
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            var tabId = rawData.Tabs[0].Id;
            var button = MakeScopedButton(formId, tabId, null, "tab", "Approve", "saveDraft", "{}");
            button["qdb_visible_conditions_json"] =
                "{\"conditions\":[{\"fieldId\":\"qdb_status\",\"operator\":\"equals\",\"value\":\"submitted\"}],\"logic\":\"AND\"}";
            button["qdb_enabled_conditions_json"] =
                "{\"conditions\":[{\"fieldId\":\"qdb_amount\",\"operator\":\"isNotEmpty\"}],\"logic\":\"OR\"}";
            rawData.ScopedButtons = new List<Entity> { button };

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert — both condition sets emitted verbatim in runtime shape
            var btn = result.Tabs[0].Buttons[0];
            var vis = Assert.IsType<JObject>(btn.VisibleWhen);
            Assert.Equal("AND", vis["logic"].ToString());
            Assert.Equal("qdb_status", vis["conditions"][0]["fieldId"].ToString());
            Assert.Equal("equals", vis["conditions"][0]["operator"].ToString());
            var en = Assert.IsType<JObject>(btn.EnabledWhen);
            Assert.Equal("OR", en["logic"].ToString());
            Assert.Equal("qdb_amount", en["conditions"][0]["fieldId"].ToString());
        }

        [Fact]
        public void Generate_WithInvalidOrEmptyButtonConditions_OmitsThem()
        {
            // Arrange — invalid JSON and empty must both drop to null (button falls back to
            // its static isVisible/isActive — legacy behavior preserved).
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            var tabId = rawData.Tabs[0].Id;
            var button = MakeScopedButton(formId, tabId, null, "tab", "Plain", "saveDraft", "{}");
            button["qdb_visible_conditions_json"] = "{not valid json";
            button["qdb_enabled_conditions_json"] = "";
            rawData.ScopedButtons = new List<Entity> { button };

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert
            var btn = result.Tabs[0].Buttons[0];
            Assert.Null(btn.VisibleWhen);
            Assert.Null(btn.EnabledWhen);
        }

        [Fact]
        public void Generate_WithNoDesign_OmitsDesignProperty()
        {
            // Arrange — design-less forms must stay byte-identical (Design omitted)
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert
            Assert.Null(result.Design);
        }

        [Fact]
        public void Generate_WithDesign_EmbedsThemeFormAndSectionDesign()
        {
            // Arrange
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            var sectionId = rawData.Sections[0].Id;
            var themeId = Guid.NewGuid();

            rawData.Theme = MakeTheme(themeId);
            rawData.FormDesign = MakeFormDesign(formId, themeId);
            rawData.SectionDesigns = new List<Entity> { MakeSectionDesign(sectionId) };

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert
            Assert.NotNull(result.Design);
            Assert.NotNull(result.Design.Theme);
            Assert.Equal("#2E8B6F", result.Design.Theme.PrimaryColor);
            Assert.Equal("Subtle", result.Design.Theme.ShadowStyle);
            Assert.Equal("1040px", result.Design.FormDesign.MaxWidth);
            Assert.Equal(".qdb-section{border:1px solid #E2E8F0;}", result.Design.FormDesign.CustomCss);
            Assert.True(result.Design.SectionDesigns.ContainsKey(sectionId.ToString()));
            Assert.Equal("qdb-demo-section", result.Design.SectionDesigns[sectionId.ToString()].CssClassName);
        }

        private static Entity MakeTheme(Guid themeId)
        {
            var theme = new Entity("qdb_theme", themeId);
            theme["qdb_theme_code"] = "REYADA-GREEN";
            theme["qdb_theme_name"] = "Reyada Green";
            theme["qdb_primary_color"] = "#2E8B6F";
            theme["qdb_shadow_style"] = new OptionSetValue(100000002);
            theme["qdb_spacing_scale"] = new OptionSetValue(100000002);
            theme["qdb_is_dark_mode"] = false;
            theme["qdb_is_active"] = true;
            return theme;
        }

        private static Entity MakeFormDesign(Guid formId, Guid themeId)
        {
            var design = new Entity("qdb_form_design", Guid.NewGuid());
            design["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            design["qdb_theme_id"] = new EntityReference("qdb_theme", themeId);
            design["qdb_max_width"] = "1040px";
            design["qdb_custom_css"] = ".qdb-section{border:1px solid #E2E8F0;}";
            design["qdb_layout_type"] = new OptionSetValue(100000001);
            design["qdb_is_active"] = true;
            return design;
        }

        private static Entity MakeSectionDesign(Guid sectionId)
        {
            var section = new Entity("qdb_section_design", Guid.NewGuid());
            section["qdb_form_section_id"] = new EntityReference("qdb_form_section", sectionId);
            section["qdb_background_color"] = "#ede9fe";
            section["qdb_padding"] = "20px";
            section["qdb_css_class"] = "qdb-demo-section";
            section["qdb_is_active"] = true;
            return section;
        }

        private static Entity MakeScopedButton(
            Guid formId, Guid? tabId, Guid? sectionId, string scope, string label, string actionType, string actionConfigJson)
        {
            var entity = new Entity("qdb_form_scoped_button", Guid.NewGuid());
            entity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            if (tabId.HasValue) entity["qdb_tab_id"] = new EntityReference("qdb_form_tab", tabId.Value);
            if (sectionId.HasValue) entity["qdb_section_id"] = new EntityReference("qdb_form_section", sectionId.Value);
            entity["qdb_placement_scope"] = scope;
            entity["qdb_label"] = label;
            entity["qdb_display_order"] = 0;
            entity["qdb_is_primary"] = true;
            entity["qdb_is_visible"] = true;
            entity["qdb_confirm_required"] = false;
            entity["qdb_action_type"] = actionType;
            entity["qdb_action_config_json"] = actionConfigJson;
            return entity;
        }

        [Fact]
        public void Generate_WithFbeFields_MapsSummaryProgressTabSectionAndMultiLookup()
        {
            // Arrange — FBE-001/002 form/tab/section/field generation.
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            rawData.FormEntity["qdb_summary_mode"] = new OptionSetValue(100000003); // Manual
            rawData.FormEntity["qdb_show_progress_bar"] = true;

            var tab = rawData.Tabs[0];
            tab["qdb_description"] = "Complete your details";
            tab["qdb_is_summary_tab"] = true;

            var section = rawData.Sections[0];
            section["qdb_icon_name"] = "Person";

            var mlField = new Entity("qdb_form_field", Guid.NewGuid());
            mlField["qdb_form_section_id"] = new EntityReference("qdb_form_section", section.Id);
            mlField["qdb_field_type"] = new OptionSetValue(100000023); // multiLookup
            mlField["qdb_schema_name"] = "qdb_team";
            mlField["qdb_label"] = "Team";
            mlField["qdb_display_order"] = 2;
            mlField["qdb_column_span"] = new OptionSetValue(100000001);
            mlField["qdb_is_required"] = false;
            mlField["qdb_is_readonly"] = false;
            mlField["qdb_is_hidden"] = false;
            mlField["qdb_is_visible"] = true;
            rawData.Fields.Add(mlField);

            // Act
            var result = _generator.Generate(rawData, "en");

            // Assert
            Assert.Equal("Manual", result.SummaryMode);
            Assert.True(result.ShowProgressBar);
            Assert.Equal("Complete your details", result.Tabs[0].Description);
            Assert.True(result.Tabs[0].IsSummaryTab);
            Assert.Equal("Person", result.Tabs[0].Sections[0].IconName);
            Assert.Contains(result.Tabs[0].Sections[0].Fields, f => f.FieldType == "multiLookup");
        }

        [Fact]
        public void Generate_WithoutSummaryModeOrProgressBar_OmitsThem()
        {
            // Byte-identity for pre-FBE forms: unset fields must be null (JSON key omitted).
            var rawData = BuildFormRawDataWithHiddenField(Guid.NewGuid());

            var result = _generator.Generate(rawData, "en");

            Assert.Null(result.SummaryMode);
            Assert.Null(result.ShowProgressBar);
        }

        [Fact]
        public void Generate_WithDesignerFormatRule_ParsesActionTargetAndConditions()
        {
            // DFE-BRJSON-FIX — the designer stores the whole rule (schema codes + nested actions)
            // in qdb_conditions_json. The in-CRM generator must parse it, not just structured columns.
            var formId = Guid.NewGuid();
            var rawData = BuildFormRawDataWithHiddenField(formId);
            var targetFieldId = rawData.Fields[0].Id; // schema "qdb_hidden_field"

            var rule = new Entity("qdb_form_business_rule", Guid.NewGuid());
            rule["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            rule["qdb_name"] = "Designer hide rule";
            rule["qdb_conditions_json"] =
                "{\"version\":\"1.0\",\"trigger_field_code\":\"qdb_status\",\"trigger_event\":\"on_change\"," +
                "\"condition_group\":{\"logical_operator\":\"AND\",\"conditions\":[" +
                "{\"field_code\":\"qdb_status\",\"operator\":\"equals\",\"value\":\"closed\"}]}," +
                "\"actions\":[{\"action_type\":\"hide_field\",\"target_field_code\":\"qdb_hidden_field\"}]}";
            rule["qdb_priority"] = 1;
            rule["qdb_is_active"] = true;
            rawData.BusinessRules = new List<Entity> { rule };

            var result = _generator.Generate(rawData, "en");

            var field = result.Tabs[0].Sections[0].Fields[0];
            Assert.Single(field.BusinessRules);
            var br = field.BusinessRules[0];
            Assert.Equal("hideField", br.Action);                    // action_type mapped
            Assert.Equal(targetFieldId, br.TargetFieldId.Value);     // target_field_code resolved to GUID
            Assert.Equal("AND", br.ConditionsLogic);
            Assert.Single(br.Conditions);
            Assert.Equal("qdb_status", br.Conditions[0].FieldId);    // schema code, not a GUID
            Assert.Equal("equals", br.Conditions[0].Operator);
        }

        private static FormRawData BuildMinimalFormRawData(Guid formId)
        {
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "TEST-001";
            formEntity["qdb_title"] = "Test Form";
            formEntity["qdb_description"] = "A test form";
            formEntity["qdb_version"] = 1;
            formEntity["qdb_status"] = new OptionSetValue(100000001);
            formEntity["qdb_allow_save_draft"] = false;
            formEntity["qdb_allow_infocard_skip"] = false;
            formEntity["qdb_infocard_counts_in_progress"] = false;
            formEntity["qdb_show_summary_step"] = false;

            return new FormRawData
            {
                FormEntity = formEntity,
                Tabs = new List<Entity>(),
                Sections = new List<Entity>(),
                Fields = new List<Entity>(),
                OptionValues = new List<Entity>(),
                ValidationRules = new List<Entity>(),
                LookupConfigs = new List<Entity>(),
                SubmissionMappings = new List<Entity>(),
                Buttons = new List<Entity>(),
                BusinessRules = new List<Entity>(),
                GridColumnConfigs = new List<Entity>(),
                InfoCardScreens = new List<Entity>(),
                InfoCardSections = new List<Entity>(),
                InfoCardItems = new List<Entity>(),
                TranslationMap = new TranslationMap(),
                Languages = new List<Entity>()
            };
        }

        private static FormRawData BuildFormRawDataWithHiddenField(Guid formId)
        {
            var rawData = BuildMinimalFormRawData(formId);

            var tabId = Guid.NewGuid();
            var tabEntity = new Entity("qdb_form_tab", tabId);
            tabEntity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            tabEntity["qdb_label"] = "Tab One";
            tabEntity["qdb_display_order"] = 1;
            tabEntity["qdb_is_visible"] = true;
            tabEntity["qdb_requires_previous_tab_complete"] = false;
            tabEntity["qdb_hide_tab_bar"] = false;
            rawData.Tabs.Add(tabEntity);

            var sectionId = Guid.NewGuid();
            var sectionEntity = new Entity("qdb_form_section", sectionId);
            sectionEntity["qdb_form_tab_id"] = new EntityReference("qdb_form_tab", tabId);
            sectionEntity["qdb_label"] = "Section One";
            sectionEntity["qdb_display_order"] = 1;
            sectionEntity["qdb_columns"] = new OptionSetValue(100000001);
            sectionEntity["qdb_is_collapsible"] = false;
            sectionEntity["qdb_is_collapsed_by_default"] = false;
            sectionEntity["qdb_is_visible"] = true;
            rawData.Sections.Add(sectionEntity);

            var fieldId = Guid.NewGuid();
            var fieldEntity = new Entity("qdb_form_field", fieldId);
            fieldEntity["qdb_form_section_id"] = new EntityReference("qdb_form_section", sectionId);
            fieldEntity["qdb_field_type"] = new OptionSetValue(100000001);
            fieldEntity["qdb_schema_name"] = "qdb_hidden_field";
            fieldEntity["qdb_label"] = "Hidden Field";
            fieldEntity["qdb_display_order"] = 1;
            fieldEntity["qdb_column_span"] = new OptionSetValue(100000001);
            fieldEntity["qdb_is_required"] = false;
            fieldEntity["qdb_is_readonly"] = false;
            fieldEntity["qdb_is_hidden"] = true;
            fieldEntity["qdb_is_visible"] = false;
            rawData.Fields.Add(fieldEntity);

            return rawData;
        }
    }
}
