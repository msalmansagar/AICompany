using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Removes hidden fields from a <see cref="FormDefinitionModel"/> before
    /// the JSON is serialised and cached. Returns a new model — never mutates input.
    /// Role-based access control is out of scope for this class.
    /// </summary>
    public sealed class SecurityStripper : ISecurityStripper
    {
        private readonly IFieldReferenceCollector _fieldReferenceCollector;

        /// <summary>Initialises the stripper with the collector that finds cross-field references.</summary>
        /// <param name="fieldReferenceCollector">Finds fields whose values other fields read.</param>
        public SecurityStripper(IFieldReferenceCollector fieldReferenceCollector)
        {
            if (fieldReferenceCollector == null) throw new ArgumentNullException(nameof(fieldReferenceCollector));
            _fieldReferenceCollector = fieldReferenceCollector;
        }

        /// <summary>
        /// Returns a new <see cref="FormDefinitionModel"/> identical to <paramref name="model"/>
        /// except that every field where <see cref="FieldDefinition.IsHidden"/> is true
        /// has been removed from its containing section. A hidden field is kept when another
        /// field reads its value at runtime (utilization bar, data-bound label, grid
        /// depends-on filter) — it still renders nothing, because IsVisible stays false.
        /// </summary>
        /// <param name="model">Source form definition (not mutated).</param>
        /// <returns>A stripped copy of the model.</returns>
        public FormDefinitionModel Strip(FormDefinitionModel model)
        {
            var referencedSchemaNames = _fieldReferenceCollector.CollectReferencedSchemaNames(model);

            return new FormDefinitionModel
            {
                Id = model.Id,
                FormCode = model.FormCode,
                Title = model.Title,
                Description = model.Description,
                Status = model.Status,
                Version = model.Version,
                AllowSaveDraft = model.AllowSaveDraft,
                DraftExpiryDays = model.DraftExpiryDays,
                PowerAutomateFlowId = model.PowerAutomateFlowId,
                ConfirmationMessage = model.ConfirmationMessage,
                ConfirmationRecordRefAttribute = model.ConfirmationRecordRefAttribute,
                AccessGroupId = model.AccessGroupId,
                AllowInfocardSkip = model.AllowInfocardSkip,
                InfocardCountsInProgress = model.InfocardCountsInProgress,
                InfocardBackLabel = model.InfocardBackLabel,
                InfocardContinueLabel = model.InfocardContinueLabel,
                InfocardStartLabel = model.InfocardStartLabel,
                InfocardSkipLabel = model.InfocardSkipLabel,
                ShowSummaryStep = model.ShowSummaryStep,
                SummaryMode = model.SummaryMode,
                SubmitConfirmation = model.SubmitConfirmation,
                ShowProgressBar = model.ShowProgressBar,
                InfoCards = model.InfoCards,
                SubmissionMappings = model.SubmissionMappings,
                Buttons = model.Buttons,
                Design = model.Design,
                CreatedAt = model.CreatedAt,
                ModifiedAt = model.ModifiedAt,
                Tabs = StripTabs(model.Tabs, referencedSchemaNames)
            };
        }

        private static List<TabDefinition> StripTabs(List<TabDefinition> tabs, ISet<string> referencedSchemaNames)
        {
            if (tabs == null) return new List<TabDefinition>();
            return tabs.Select(tab => new TabDefinition
            {
                Id = tab.Id,
                FormDefinitionId = tab.FormDefinitionId,
                Label = tab.Label,
                IconName = tab.IconName,
                Description = tab.Description,
                IsSummaryTab = tab.IsSummaryTab,
                DisplayOrder = tab.DisplayOrder,
                IsVisible = tab.IsVisible,
                RequiresPreviousTabComplete = tab.RequiresPreviousTabComplete,
                HideTabBar = tab.HideTabBar,
                RevealsSectionsOneAtATime = tab.RevealsSectionsOneAtATime,
                Buttons = tab.Buttons,
                SubmitConfirmation = tab.SubmitConfirmation,
                Sections = StripSections(tab.Sections, referencedSchemaNames)
            }).ToList();
        }

        private static List<SectionDefinition> StripSections(List<SectionDefinition> sections, ISet<string> referencedSchemaNames)
        {
            if (sections == null) return new List<SectionDefinition>();
            return sections.Select(section => new SectionDefinition
            {
                Id = section.Id,
                TabId = section.TabId,
                Label = section.Label,
                Description = section.Description,
                IconName = section.IconName,
                DisplayOrder = section.DisplayOrder,
                Columns = section.Columns,
                IsCollapsible = section.IsCollapsible,
                IsCollapsedByDefault = section.IsCollapsedByDefault,
                IsVisible = section.IsVisible,
                Buttons = section.Buttons,
                Fields = StripFields(section.Fields, referencedSchemaNames)
            }).ToList();
        }

        private static List<FieldDefinition> StripFields(List<FieldDefinition> fields, ISet<string> referencedSchemaNames)
        {
            if (fields == null) return new List<FieldDefinition>();
            return fields
                .Where(field => !field.IsHidden || IsReadByAnotherField(field, referencedSchemaNames))
                .ToList();
        }

        private static bool IsReadByAnotherField(FieldDefinition field, ISet<string> referencedSchemaNames)
        {
            if (string.IsNullOrWhiteSpace(field.SchemaName)) return false;
            return referencedSchemaNames.Contains(field.SchemaName);
        }
    }
}
