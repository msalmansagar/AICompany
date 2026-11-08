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
    /// A grid column marked Is Visible = No used to be filtered out of the metadata query, so
    /// it never reached the generated JSON at all. Hidden must mean "not drawn", not "not
    /// published" — otherwise a hidden column's value cannot round-trip to the child record,
    /// and a maker who hides a column loses it rather than stopping it being shown.
    /// </summary>
    public sealed class GridColumnVisibilityTests
    {
        private readonly FormJsonGenerator _generator;

        public GridColumnVisibilityTests()
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);

            _generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);
        }

        [Fact]
        public void Generate_PublishesHiddenGridColumn_WithIsVisibleFalse()
        {
            var rawData = BuildFormWithGridColumns(hiddenColumnIsVisible: false);

            var result = _generator.Generate(rawData, "en");

            var hidden = SingleColumnNamed(result, "Internal Key");
            Assert.False(hidden.IsVisible);
        }

        [Fact]
        public void Generate_KeepsHiddenGridColumn_InTheColumnList()
        {
            var rawData = BuildFormWithGridColumns(hiddenColumnIsVisible: false);

            var result = _generator.Generate(rawData, "en");

            Assert.Equal(2, GridColumns(result).Count);
        }

        [Fact]
        public void Generate_MarksVisibleGridColumn_AsVisible()
        {
            var rawData = BuildFormWithGridColumns(hiddenColumnIsVisible: false);

            var result = _generator.Generate(rawData, "en");

            var shown = SingleColumnNamed(result, "Full Name");
            Assert.True(shown.IsVisible);
        }

        /// <summary>
        /// Columns created before qdb_is_visible existed come back with the attribute absent.
        /// Absent must read as visible, or every pre-existing grid renders empty.
        /// </summary>
        [Fact]
        public void Generate_TreatsAbsentIsVisible_AsVisible()
        {
            var rawData = BuildFormWithGridColumns(hiddenColumnIsVisible: null);

            var result = _generator.Generate(rawData, "en");

            var legacy = SingleColumnNamed(result, "Internal Key");
            Assert.True(legacy.IsVisible);
        }

        private static List<GridColumnConfig> GridColumns(FormDefinitionModel result)
        {
            return result.Tabs
                .SelectMany(t => t.Sections)
                .SelectMany(s => s.Fields)
                .Where(f => f.GridConfig != null)
                .SelectMany(f => f.GridConfig.ColumnConfigs)
                .ToList();
        }

        private static GridColumnConfig SingleColumnNamed(
            FormDefinitionModel result, string label)
        {
            return GridColumns(result).Single(c => c.ColumnLabel == label);
        }

        /// <summary>
        /// A form with one grid field carrying two columns: one plainly visible, one whose
        /// qdb_is_visible is set to <paramref name="hiddenColumnIsVisible"/>, or omitted
        /// entirely when that is null.
        /// </summary>
        private static FormRawData BuildFormWithGridColumns(bool? hiddenColumnIsVisible)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "GRID-VIS-001";
            formEntity["qdb_title"] = "Grid Visibility Form";
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
                GridColumnConfigs = new List<Entity>
                {
                    BuildColumn(fieldId, "qdb_fullname", "Full Name", 1, true),
                    BuildColumn(fieldId, "qdb_internal_key", "Internal Key", 2, hiddenColumnIsVisible),
                },
                InfoCardScreens = new List<Entity>(),
                InfoCardSections = new List<Entity>(),
                InfoCardItems = new List<Entity>(),
                TranslationMap = new TranslationMap(),
                Languages = new List<Entity>()
            };
        }

        private static Entity BuildColumn(
            Guid fieldId, string attribute, string label, int order, bool? isVisible)
        {
            var column = new Entity("qdb_grid_column_config", Guid.NewGuid());
            column["qdb_form_field_id"] = new EntityReference("qdb_form_field", fieldId);
            column["qdb_column_attribute"] = attribute;
            column["qdb_column_label"] = label;
            column["qdb_column_field_type"] = "text";
            column["qdb_display_order"] = order;
            if (isVisible.HasValue) column["qdb_is_visible"] = isVisible.Value;
            return column;
        }

        /// <summary>qdb_field_type option value for the interactive grid field.</summary>
        private const int InteractiveGridFieldTypeCode = 100000021;

        /// <summary>qdb_grid_mode option value for an entry grid. BuildGridConfig returns null
        /// without this attribute, so the fixture must carry it.</summary>
        private const int EntryGridModeCode = 100000001;
    }
}
