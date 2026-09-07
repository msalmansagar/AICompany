using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Moq;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Grid columns had no validation of any kind — a maker could require the grid ("add at
    /// least one row") but not require a value in a column, cap its length, or constrain its
    /// shape. These assert the generator publishes the per-column rules the runtime enforces.
    /// </summary>
    public sealed class GridColumnValidationTests
    {
        private readonly FormJsonGenerator _generator;

        public GridColumnValidationTests()
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);

            _generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);
        }

        [Fact]
        public void Generate_PublishesIsRequired()
        {
            var column = _generator.Generate(BuildForm(c => c["qdb_is_required"] = true), "en");

            Assert.True(FirstColumn(column).IsRequired);
        }

        [Fact]
        public void Generate_PublishesMaxLength()
        {
            var result = _generator.Generate(BuildForm(c => c["qdb_max_length"] = 40), "en");

            Assert.Equal(40, FirstColumn(result).MaxLength);
        }

        /// <summary>Absent must stay null so the JSON omits it and the runtime applies no cap.</summary>
        [Fact]
        public void Generate_LeavesMaxLengthNull_WhenTheColumnDoesNotCarryIt()
        {
            var result = _generator.Generate(BuildForm(c => { }), "en");

            Assert.Null(FirstColumn(result).MaxLength);
        }

        [Fact]
        public void Generate_PublishesValidationFormatAndMessage()
        {
            var result = _generator.Generate(BuildForm(c =>
            {
                c["qdb_validation_format"] = "email";
                c["qdb_validation_message"] = "Enter a work email";
            }), "en");

            var column = FirstColumn(result);
            Assert.Equal("email", column.ValidationFormat);
            Assert.Equal("Enter a work email", column.ValidationMessage);
        }

        [Fact]
        public void Generate_PublishesCustomPattern()
        {
            var result = _generator.Generate(BuildForm(c =>
            {
                c["qdb_validation_format"] = "custom";
                c["qdb_validation_pattern"] = "^[A-Z]{2}[0-9]{4}$";
            }), "en");

            Assert.Equal("^[A-Z]{2}[0-9]{4}$", FirstColumn(result).ValidationPattern);
        }

        /// <summary>
        /// A typo must not reach the runtime as a format nothing knows how to check — that
        /// reads to a maker as "validation is configured but never fires".
        /// </summary>
        [Fact]
        public void Generate_DropsAnUnrecognisedValidationFormat()
        {
            var result = _generator.Generate(BuildForm(c => c["qdb_validation_format"] = "emial"), "en");

            Assert.Null(FirstColumn(result).ValidationFormat);
        }

        [Fact]
        public void Generate_LeavesValidationOff_WhenNoColumnDeclaresIt()
        {
            var column = FirstColumn(_generator.Generate(BuildForm(c => { }), "en"));

            Assert.False(column.IsRequired);
            Assert.Null(column.ValidationFormat);
            Assert.Null(column.ValidationPattern);
            Assert.Null(column.ValidationMessage);
        }

        private static GridColumnConfig FirstColumn(FormDefinitionModel result)
        {
            return result.Tabs
                .SelectMany(t => t.Sections)
                .SelectMany(s => s.Fields)
                .Where(f => f.GridConfig != null)
                .SelectMany(f => f.GridConfig.ColumnConfigs)
                .Single();
        }

        /// <summary>A one-grid, one-column form whose column is shaped by <paramref name="configure"/>.</summary>
        private static FormRawData BuildForm(Action<Entity> configure)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "GRID-VAL-001";
            formEntity["qdb_title"] = "Grid Validation Form";
            formEntity["qdb_version"] = 1;
            formEntity["qdb_status"] = new OptionSetValue(100000001);

            var tabId = Guid.NewGuid();
            var tabEntity = new Entity("qdb_form_tab", tabId);
            tabEntity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            tabEntity["qdb_label"] = "Tab One";
            tabEntity["qdb_display_order"] = 1;
            tabEntity["qdb_is_visible"] = true;

            var sectionId = Guid.NewGuid();
            var sectionEntity = new Entity("qdb_form_section", sectionId);
            sectionEntity["qdb_form_tab_id"] = new EntityReference("qdb_form_tab", tabId);
            sectionEntity["qdb_label"] = "Section One";
            sectionEntity["qdb_display_order"] = 1;
            sectionEntity["qdb_columns"] = new OptionSetValue(100000001);
            sectionEntity["qdb_is_visible"] = true;

            var fieldId = Guid.NewGuid();
            var fieldEntity = new Entity("qdb_form_field", fieldId);
            fieldEntity["qdb_form_section_id"] = new EntityReference("qdb_form_section", sectionId);
            fieldEntity["qdb_field_type"] = new OptionSetValue(100000021);
            fieldEntity["qdb_schema_name"] = "qdb_entries";
            fieldEntity["qdb_label"] = "Entries";
            fieldEntity["qdb_display_order"] = 1;
            fieldEntity["qdb_column_span"] = new OptionSetValue(100000001);
            fieldEntity["qdb_grid_mode"] = new OptionSetValue(100000001);
            fieldEntity["qdb_grid_entity_name"] = "qdb_child";

            var column = new Entity("qdb_grid_column_config", Guid.NewGuid());
            column["qdb_form_field_id"] = new EntityReference("qdb_form_field", fieldId);
            column["qdb_column_attribute"] = "qdb_reference";
            column["qdb_column_label"] = "Reference";
            column["qdb_column_field_type"] = "text";
            column["qdb_display_order"] = 1;
            configure(column);

            return new FormRawData
            {
                FormEntity = formEntity,
                Tabs = new List<Entity> { tabEntity },
                Sections = new List<Entity> { sectionEntity },
                Fields = new List<Entity> { fieldEntity },
                OptionValues = new List<Entity>(),
                ValidationRules = new List<Entity>(),
                LookupConfigs = new List<Entity>(),
                SubmissionMappings = new List<Entity>(),
                Buttons = new List<Entity>(),
                BusinessRules = new List<Entity>(),
                GridColumnConfigs = new List<Entity> { column },
                InfoCardScreens = new List<Entity>(),
                InfoCardSections = new List<Entity>(),
                InfoCardItems = new List<Entity>(),
                TranslationMap = new TranslationMap(),
                Languages = new List<Entity>()
            };
        }
    }
}
