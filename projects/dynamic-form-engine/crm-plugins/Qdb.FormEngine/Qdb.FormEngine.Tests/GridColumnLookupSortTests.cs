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
    /// A lookup grid column can order its options by the display attribute. The direction is
    /// carried in the column's options JSON, so the in-CRM publisher has to read it — the Node
    /// backend reading it alone would leave the two paths disagreeing.
    /// </summary>
    public sealed class GridColumnLookupSortTests
    {
        private readonly FormJsonGenerator _generator;

        public GridColumnLookupSortTests()
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);

            _generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);
        }

        [Fact]
        public void Generate_PublishesTheSortDirection_WhenTheColumnSetsOne()
        {
            var rawData = BuildFormWithLookupColumn(
                "{\"v\":2,\"filterType\":\"lookup\",\"lookupTargetEntity\":\"qdb_year\"," +
                "\"lookupDisplayAttribute\":\"qdb_name\",\"lookupSort\":\"desc\"}");

            var result = _generator.Generate(rawData, "en");

            Assert.Equal("desc", SingleColumn(result).LookupSort);
        }

        [Fact]
        public void Generate_AcceptsTheShorterSortKey_WhenTheJsonWasAuthoredByHand()
        {
            var rawData = BuildFormWithLookupColumn(
                "{\"v\":2,\"filterType\":\"lookup\",\"lookupTargetEntity\":\"qdb_year\"," +
                "\"lookupDisplayAttribute\":\"qdb_name\",\"lookupValueAttribute\":\"qdb_yearid\"," +
                "\"sort\":\"asc\"}");

            var result = _generator.Generate(rawData, "en");

            Assert.Equal("asc", SingleColumn(result).LookupSort);
        }

        [Fact]
        public void Generate_LeavesTheSortUnset_WhenTheColumnDoesNotAskForOne()
        {
            var rawData = BuildFormWithLookupColumn(
                "{\"v\":2,\"filterType\":\"lookup\",\"lookupTargetEntity\":\"qdb_year\"," +
                "\"lookupDisplayAttribute\":\"qdb_name\"}");

            var result = _generator.Generate(rawData, "en");

            Assert.Null(SingleColumn(result).LookupSort);
        }

        [Fact]
        public void Generate_IgnoresASortValue_ThatNamesNoDirection()
        {
            var rawData = BuildFormWithLookupColumn("{\"v\":2,\"sort\":\"sideways\"}");

            var result = _generator.Generate(rawData, "en");

            Assert.Null(SingleColumn(result).LookupSort);
        }

        [Fact]
        public void Generate_KeepsTheLookupConfig_AlongsideTheSort()
        {
            var rawData = BuildFormWithLookupColumn(
                "{\"v\":2,\"filterType\":\"lookup\",\"lookupTargetEntity\":\"qdb_year\"," +
                "\"lookupDisplayAttribute\":\"qdb_name\",\"lookupSort\":\"asc\"}");

            var column = SingleColumn(_generator.Generate(rawData, "en"));

            Assert.Equal("qdb_year", column.LookupTargetEntity);
            Assert.Equal("qdb_name", column.LookupDisplayAttribute);
        }

        private static GridColumnConfig SingleColumn(FormDefinitionModel result)
        {
            return result.Tabs
                .SelectMany(t => t.Sections)
                .SelectMany(s => s.Fields)
                .Where(f => f.GridConfig != null)
                .SelectMany(f => f.GridConfig.ColumnConfigs)
                .Single();
        }

        private static FormRawData BuildFormWithLookupColumn(string optionsJson)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "GRID-SORT-001";
            formEntity["qdb_title"] = "Grid Sort Form";
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
            fieldEntity["qdb_field_type"] = new OptionSetValue(InteractiveGridFieldTypeCode);
            fieldEntity["qdb_schema_name"] = "qdb_entries";
            fieldEntity["qdb_label"] = "Entries";
            fieldEntity["qdb_display_order"] = 1;
            fieldEntity["qdb_column_span"] = new OptionSetValue(100000001);
            fieldEntity["qdb_grid_mode"] = new OptionSetValue(EntryGridModeCode);
            fieldEntity["qdb_grid_entity_name"] = "qdb_child";

            var column = new Entity("qdb_grid_column_config", Guid.NewGuid());
            column["qdb_form_field_id"] = new EntityReference("qdb_form_field", fieldId);
            column["qdb_column_attribute"] = "qdb_year";
            column["qdb_column_label"] = "Year";
            column["qdb_column_field_type"] = "lookup";
            column["qdb_display_order"] = 1;
            column["qdb_column_options_json"] = optionsJson;

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

        /// <summary>qdb_field_type option value for the interactive grid field.</summary>
        private const int InteractiveGridFieldTypeCode = 100000021;

        /// <summary>qdb_grid_mode option value for an entry grid.</summary>
        private const int EntryGridModeCode = 100000001;
    }
}
