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
            _stripper = new SecurityStripper();
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

        private static FieldDefinition BuildField(Guid id, bool isHidden)
        {
            return new FieldDefinition
            {
                Id = id,
                SectionId = Guid.NewGuid(),
                FieldType = "text",
                SchemaName = "qdb_test_field",
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
