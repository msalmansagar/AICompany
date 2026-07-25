using System;
using System.Collections.Generic;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Unit tests for <see cref="FieldReferenceCollector"/>.
    /// </summary>
    public sealed class FieldReferenceCollectorTests
    {
        private readonly FieldReferenceCollector _collector;

        /// <summary>Initialises the system under test.</summary>
        public FieldReferenceCollectorTests()
        {
            _collector = new FieldReferenceCollector();
        }

        [Fact]
        public void CollectReferencedSchemaNames_NullModel_ReturnsEmptySet()
        {
            // Act
            var result = _collector.CollectReferencedSchemaNames(null);

            // Assert
            Assert.Empty(result);
        }

        [Fact]
        public void CollectReferencedSchemaNames_ModelWithoutReferences_ReturnsEmptySet()
        {
            // Arrange
            var model = BuildModel(new FieldDefinition { SchemaName = "qdb_plain" });

            // Act
            var result = _collector.CollectReferencedSchemaNames(model);

            // Assert
            Assert.Empty(result);
        }

        [Fact]
        public void CollectReferencedSchemaNames_BarValueAndMax_ReturnsBothSchemaNames()
        {
            // Arrange
            var model = BuildModel(new FieldDefinition
            {
                SchemaName = "qdb_vd_util",
                BarValueFieldSchemaName = "qdb_vd_drawn",
                BarMaxFieldSchemaName = "qdb_vd_limit"
            });

            // Act
            var result = _collector.CollectReferencedSchemaNames(model);

            // Assert
            Assert.Equal(new[] { "qdb_vd_drawn", "qdb_vd_limit" }, Sorted(result));
        }

        [Fact]
        public void CollectReferencedSchemaNames_DataBoundLabelSource_ReturnsSourceSchemaName()
        {
            // Arrange
            var model = BuildModel(new FieldDefinition
            {
                SchemaName = "qdb_summary_label",
                SourceFieldSchemaName = "qdb_applicant_name"
            });

            // Act
            var result = _collector.CollectReferencedSchemaNames(model);

            // Assert
            Assert.Contains("qdb_applicant_name", result);
        }

        [Fact]
        public void CollectReferencedSchemaNames_CommaSeparatedDependsOn_ReturnsEverySchemaNameTrimmed()
        {
            // Arrange
            var model = BuildModel(new FieldDefinition
            {
                SchemaName = "demo_type_results",
                GridConfig = new GridFieldConfig { DependsOnFieldId = " demo_service_type , demo_company_picker " }
            });

            // Act
            var result = _collector.CollectReferencedSchemaNames(model);

            // Assert
            Assert.Equal(new[] { "demo_company_picker", "demo_service_type" }, Sorted(result));
        }

        [Fact]
        public void CollectReferencedSchemaNames_MatchIsCaseInsensitive()
        {
            // Arrange
            var model = BuildModel(new FieldDefinition
            {
                SchemaName = "qdb_vd_util",
                BarMaxFieldSchemaName = "QDB_VD_LIMIT"
            });

            // Act
            var result = _collector.CollectReferencedSchemaNames(model);

            // Assert
            Assert.Contains("qdb_vd_limit", result);
        }

        private static string[] Sorted(ISet<string> schemaNames)
        {
            var ordered = new List<string>(schemaNames);
            ordered.Sort(StringComparer.OrdinalIgnoreCase);
            return ordered.ToArray();
        }

        private static FormDefinitionModel BuildModel(params FieldDefinition[] fields)
        {
            return new FormDefinitionModel
            {
                Id = Guid.NewGuid(),
                FormCode = "TEST-001",
                Tabs = new List<TabDefinition>
                {
                    new TabDefinition
                    {
                        Id = Guid.NewGuid(),
                        Sections = new List<SectionDefinition>
                        {
                            new SectionDefinition
                            {
                                Id = Guid.NewGuid(),
                                Fields = new List<FieldDefinition>(fields)
                            }
                        }
                    }
                }
            };
        }
    }
}
