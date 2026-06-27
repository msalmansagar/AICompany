using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
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
