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
        /// <summary>
        /// Returns a new <see cref="FormDefinitionModel"/> identical to <paramref name="model"/>
        /// except that every field where <see cref="FieldDefinition.IsHidden"/> is true
        /// has been removed from its containing section.
        /// </summary>
        /// <param name="model">Source form definition (not mutated).</param>
        /// <returns>A stripped copy of the model.</returns>
        public FormDefinitionModel Strip(FormDefinitionModel model)
        {
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
                ShowProgressBar = model.ShowProgressBar,
                InfoCards = model.InfoCards,
                SubmissionMappings = model.SubmissionMappings,
                Buttons = model.Buttons,
                Design = model.Design,
                CreatedAt = model.CreatedAt,
                ModifiedAt = model.ModifiedAt,
                Tabs = StripTabs(model.Tabs)
            };
        }

        private static List<TabDefinition> StripTabs(List<TabDefinition> tabs)
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
                Buttons = tab.Buttons,
                Sections = StripSections(tab.Sections)
            }).ToList();
        }

        private static List<SectionDefinition> StripSections(List<SectionDefinition> sections)
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
                Fields = StripFields(section.Fields)
            }).ToList();
        }

        private static List<FieldDefinition> StripFields(List<FieldDefinition> fields)
        {
            if (fields == null) return new List<FieldDefinition>();
            return fields.Where(field => !field.IsHidden).ToList();
        }
    }
}
