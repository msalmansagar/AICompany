using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Moq;
using Newtonsoft.Json;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// DEF-002: the designer saves a grid column's Is Editable switch to qdb_is_editable, but
    /// the generator never read it, so a column set to No stayed editable. A column set to No
    /// now publishes isReadonly: true. Anything else publishes no flag, so every grid generated
    /// before this stays byte-identical.
    /// </summary>
    public sealed class GridColumnEditableTests
    {
        private readonly FormJsonGenerator _generator;

        public GridColumnEditableTests()
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);

            _generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);
        }

        [Fact]
        public void Generate_ColumnNotEditable_PublishesReadonly()
        {
            var column = GenerateSingleColumn(isEditable: false);

            Assert.True(column.IsReadonly);
        }

        [Fact]
        public void Generate_ColumnEditable_OmitsReadonlyFromJson()
        {
            var column = GenerateSingleColumn(isEditable: true);

            Assert.DoesNotContain("isReadonly", JsonConvert.SerializeObject(column));
        }

        /// <summary>
        /// An on-prem org that never provisioned qdb_is_editable returns the attribute absent.
        /// Absent must stay editable, which is how every grid behaved before this fix.
        /// </summary>
        [Fact]
        public void Generate_IsEditableAbsent_OmitsReadonlyFromJson()
        {
            var column = GenerateSingleColumn(isEditable: null);

            Assert.DoesNotContain("isReadonly", JsonConvert.SerializeObject(column));
        }

        private GridColumnConfig GenerateSingleColumn(bool? isEditable)
        {
            var result = _generator.Generate(BuildFormWithOneGridColumn(isEditable), "en");
            return result.Tabs
                .SelectMany(t => t.Sections)
                .SelectMany(s => s.Fields)
                .Where(f => f.GridConfig != null)
                .SelectMany(f => f.GridConfig.ColumnConfigs)
                .Single();
        }

        private static FormRawData BuildFormWithOneGridColumn(bool? isEditable)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "GRID-EDIT-001";
            formEntity["qdb_title"] = "Grid Editable Form";
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
            fieldEntity["qdb_schema_name"] = "qdb_items";
            fieldEntity["qdb_label"] = "Items";
            fieldEntity["qdb_display_order"] = 1;
            fieldEntity["qdb_column_span"] = new OptionSetValue(100000001);
            fieldEntity["qdb_grid_mode"] = new OptionSetValue(EntryGridModeCode);
            fieldEntity["qdb_grid_entity_name"] = "qdb_item";

            var column = new Entity("qdb_grid_column_config", Guid.NewGuid());
            column["qdb_form_field_id"] = new EntityReference("qdb_form_field", fieldId);
            column["qdb_column_attribute"] = "qdb_origin";
            column["qdb_column_label"] = "Country of origin";
            column["qdb_column_field_type"] = "text";
            column["qdb_display_order"] = 1;
            if (isEditable.HasValue) column["qdb_is_editable"] = isEditable.Value;

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
