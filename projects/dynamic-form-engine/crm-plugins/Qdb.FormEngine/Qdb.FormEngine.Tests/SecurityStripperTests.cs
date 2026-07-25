using System;
using System.Collections.Generic;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Unit tests for <see cref="SecurityStripper"/>.
    /// </summary>
    public sealed class SecurityStripperTests
    {
        private readonly SecurityStripper _stripper;

        /// <summary>Initialises the system under test.</summary>
        public SecurityStripperTests()
        {
            _stripper = new SecurityStripper(new FieldReferenceCollector());
        }

        [Fact]
        public void Strip_HiddenField_RemovesField()
        {
            // Arrange
            var model = BuildModelWithFields(
                BuildField(Guid.NewGuid(), isHidden: true));

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Empty(result.Tabs[0].Sections[0].Fields);
        }

        [Fact]
        public void Strip_VisibleField_RetainsField()
        {
            // Arrange
            var visibleFieldId = Guid.NewGuid();
            var model = BuildModelWithFields(
                BuildField(visibleFieldId, isHidden: false));

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Single(result.Tabs[0].Sections[0].Fields);
            Assert.Equal(visibleFieldId, result.Tabs[0].Sections[0].Fields[0].Id);
        }

        [Fact]
        public void Strip_DoesNotMutateInput()
        {
            // Arrange
            var fieldId = Guid.NewGuid();
            var model = BuildModelWithFields(
                BuildField(fieldId, isHidden: true));
            var originalFieldCount = model.Tabs[0].Sections[0].Fields.Count;

            // Act
            _stripper.Strip(model);

            // Assert — original model is unchanged
            Assert.Equal(originalFieldCount, model.Tabs[0].Sections[0].Fields.Count);
        }

        [Fact]
        public void Strip_MixedFields_RemovesOnlyHiddenFields()
        {
            // Arrange
            var visibleId = Guid.NewGuid();
            var hiddenId = Guid.NewGuid();
            var model = BuildModelWithFields(
                BuildField(visibleId, isHidden: false),
                BuildField(hiddenId, isHidden: true));

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Single(result.Tabs[0].Sections[0].Fields);
            Assert.Equal(visibleId, result.Tabs[0].Sections[0].Fields[0].Id);
        }

        [Fact]
        public void Strip_PreservesDesignPayload()
        {
            // Arrange — design must survive stripping so the render cache carries styling
            var model = BuildModelWithFields(BuildField(Guid.NewGuid(), isHidden: false));
            model.Design = new DesignPayload
            {
                Theme = new ThemeDefinition { Id = "t1", ThemeCode = "GREEN", PrimaryColor = "#2E8B6F" },
                FormDesign = new FormDesign { Id = "d1", CustomCss = ".x{}" }
            };

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.NotNull(result.Design);
            Assert.Equal("#2E8B6F", result.Design.Theme.PrimaryColor);
            Assert.Equal(".x{}", result.Design.FormDesign.CustomCss);
        }

        [Fact]
        public void Strip_PreservesScopedButtonsOnTabAndSection()
        {
            // Arrange — scoped buttons must survive stripping for the cache (in-CRM engine) path
            var model = BuildModelWithFields(BuildField(Guid.NewGuid(), isHidden: false));
            model.Tabs[0].Buttons = new List<ScopedButton>
            {
                new ScopedButton { Id = Guid.NewGuid(), PlacementScope = "tab", Label = "Next" }
            };
            model.Tabs[0].Sections[0].Buttons = new List<ScopedButton>
            {
                new ScopedButton { Id = Guid.NewGuid(), PlacementScope = "section", Label = "Submit" }
            };

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Single(result.Tabs[0].Buttons);
            Assert.Equal("Next", result.Tabs[0].Buttons[0].Label);
            Assert.Single(result.Tabs[0].Sections[0].Buttons);
            Assert.Equal("Submit", result.Tabs[0].Sections[0].Buttons[0].Label);
        }

        [Fact]
        public void Strip_PreservesFbeFormTabSectionFields()
        {
            // Arrange — FBE-001/002 form/tab/section fields must survive stripping so the
            // in-CRM render cache carries summary mode, progress bar, tab description/summary
            // flag and section icon (regression: the stripper reconstructs these objects).
            var model = BuildModelWithFields(BuildField(Guid.NewGuid(), isHidden: false));
            model.SummaryMode = "Manual";
            model.ShowProgressBar = true;
            model.Tabs[0].Description = "Tab intro";
            model.Tabs[0].IsSummaryTab = true;
            model.Tabs[0].Sections[0].IconName = "Person";

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Equal("Manual", result.SummaryMode);
            Assert.True(result.ShowProgressBar);
            Assert.Equal("Tab intro", result.Tabs[0].Description);
            Assert.True(result.Tabs[0].IsSummaryTab);
            Assert.Equal("Person", result.Tabs[0].Sections[0].IconName);
        }

        [Fact]
        public void Strip_HiddenFieldReadByBarMax_RetainsField()
        {
            // Arrange — DFE-NUMBAR: the bar divides by a hidden field's value
            var hiddenMax = BuildField(Guid.NewGuid(), isHidden: true, schemaName: "qdb_vd_limit");
            var bar = BuildField(Guid.NewGuid(), isHidden: false, schemaName: "qdb_vd_util");
            bar.NumberDisplayStyle = "bar";
            bar.BarMaxFieldSchemaName = "qdb_vd_limit";
            var model = BuildModelWithFields(hiddenMax, bar);

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Contains(result.Tabs[0].Sections[0].Fields, field => field.SchemaName == "qdb_vd_limit");
        }

        [Fact]
        public void Strip_HiddenFieldReadByBarValue_RetainsFieldAsInvisible()
        {
            // Arrange
            var hiddenValue = BuildField(Guid.NewGuid(), isHidden: true, schemaName: "qdb_vd_drawn");
            var bar = BuildField(Guid.NewGuid(), isHidden: false, schemaName: "qdb_vd_util");
            bar.BarValueFieldSchemaName = "qdb_vd_drawn";
            var model = BuildModelWithFields(hiddenValue, bar);

            // Act
            var result = _stripper.Strip(model);

            // Assert — retained for its value, but still never rendered
            var retained = Assert.Single(result.Tabs[0].Sections[0].Fields, field => field.SchemaName == "qdb_vd_drawn");
            Assert.False(retained.IsVisible);
        }

        [Fact]
        public void Strip_HiddenFieldReadByDataBoundLabel_RetainsField()
        {
            // Arrange — DFE-FBE-001
            var hiddenSource = BuildField(Guid.NewGuid(), isHidden: true, schemaName: "qdb_applicant_name");
            var label = BuildField(Guid.NewGuid(), isHidden: false, schemaName: "qdb_summary_label");
            label.SourceFieldSchemaName = "qdb_applicant_name";
            var model = BuildModelWithFields(hiddenSource, label);

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Contains(result.Tabs[0].Sections[0].Fields, field => field.SchemaName == "qdb_applicant_name");
        }

        [Fact]
        public void Strip_HiddenFieldNamedInGridDependsOnList_RetainsField()
        {
            // Arrange — DFE-GRIDSRC-001: comma-separated depends-on schema names
            var hiddenFilter = BuildField(Guid.NewGuid(), isHidden: true, schemaName: "demo_company_picker");
            var grid = BuildField(Guid.NewGuid(), isHidden: false, schemaName: "demo_type_results");
            grid.GridConfig = new GridFieldConfig { DependsOnFieldId = "demo_service_type, demo_company_picker" };
            var model = BuildModelWithFields(hiddenFilter, grid);

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.Contains(result.Tabs[0].Sections[0].Fields, field => field.SchemaName == "demo_company_picker");
        }

        [Fact]
        public void Strip_HiddenFieldNobodyReads_StillRemovesField()
        {
            // Arrange — retention is by reference only; unreferenced hidden fields still go
            var hiddenUnused = BuildField(Guid.NewGuid(), isHidden: true, schemaName: "qdb_internal_note");
            var bar = BuildField(Guid.NewGuid(), isHidden: false, schemaName: "qdb_vd_util");
            bar.BarMaxFieldSchemaName = "qdb_vd_limit";
            var model = BuildModelWithFields(hiddenUnused, bar);

            // Act
            var result = _stripper.Strip(model);

            // Assert
            Assert.DoesNotContain(result.Tabs[0].Sections[0].Fields, field => field.SchemaName == "qdb_internal_note");
        }

        private static FormDefinitionModel BuildModelWithFields(params FieldDefinition[] fields)
        {
            var sectionId = Guid.NewGuid();
            var tabId = Guid.NewGuid();
            var formId = Guid.NewGuid();

            return new FormDefinitionModel
            {
                Id = formId,
                FormCode = "TEST-001",
                Title = "Test",
                Tabs = new List<TabDefinition>
                {
                    new TabDefinition
                    {
                        Id = tabId,
                        FormDefinitionId = formId,
                        Label = "Tab 1",
                        DisplayOrder = 1,
                        IsVisible = true,
                        Sections = new List<SectionDefinition>
                        {
                            new SectionDefinition
                            {
                                Id = sectionId,
                                TabId = tabId,
                                Label = "Section 1",
                                DisplayOrder = 1,
                                Columns = 1,
                                IsVisible = true,
                                Fields = new List<FieldDefinition>(fields)
                            }
                        }
                    }
                },
                Buttons = new List<FormButton>(),
                SubmissionMappings = new List<SubmissionMapping>(),
                InfoCards = new List<InfoCardScreen>()
            };
        }

        private static FieldDefinition BuildField(Guid id, bool isHidden, string schemaName = "qdb_test_field")
        {
            return new FieldDefinition
            {
                Id = id,
                SectionId = Guid.NewGuid(),
                FieldType = "text",
                SchemaName = schemaName,
                Label = "Test Field",
                DisplayOrder = 1,
                ColumnSpan = 1,
                IsHidden = isHidden,
                IsVisible = !isHidden,
                Options = new List<OptionValue>(),
                ValidationRules = new List<ValidationRule>(),
                BusinessRules = new List<BusinessRule>()
            };
        }
    }
}
