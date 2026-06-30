using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Abstractions
{
    /// <summary>
    /// Carries all raw CRM Entity records needed to generate a single
    /// language variant of a published form definition. Populated by
    /// <see cref="IMetadataReader"/> and consumed by the generation pipeline.
    /// </summary>
    public sealed class FormRawData
    {
        /// <summary>The root qdb_form_definition entity record.</summary>
        public Entity FormEntity { get; set; }

        /// <summary>All active qdb_form_tab records for this form.</summary>
        public List<Entity> Tabs { get; set; }

        /// <summary>All active qdb_form_section records across all tabs.</summary>
        public List<Entity> Sections { get; set; }

        /// <summary>All active qdb_form_field records across all sections.</summary>
        public List<Entity> Fields { get; set; }

        /// <summary>All active qdb_form_option_value records across all fields.</summary>
        public List<Entity> OptionValues { get; set; }

        /// <summary>All active qdb_form_validation_rule records across all fields.</summary>
        public List<Entity> ValidationRules { get; set; }

        /// <summary>All qdb_form_lookup_config records for lookup fields.</summary>
        public List<Entity> LookupConfigs { get; set; }

        /// <summary>All active qdb_form_submission_mapping records for this form.</summary>
        public List<Entity> SubmissionMappings { get; set; }

        /// <summary>All active qdb_form_button records for this form.</summary>
        public List<Entity> Buttons { get; set; }

        /// <summary>All active qdb_form_scoped_button records (tab/section buttons) for this form. DFE-BTN-001.</summary>
        public List<Entity> ScopedButtons { get; set; }

        /// <summary>All active qdb_form_business_rule records for this form.</summary>
        public List<Entity> BusinessRules { get; set; }

        /// <summary>All visible qdb_grid_column_config records for grid fields.</summary>
        public List<Entity> GridColumnConfigs { get; set; }

        /// <summary>All active qdb_info_card_screen records for this form.</summary>
        public List<Entity> InfoCardScreens { get; set; }

        /// <summary>All active qdb_info_card_section records for all screens.</summary>
        public List<Entity> InfoCardSections { get; set; }

        /// <summary>All active qdb_info_card_item records for all sections.</summary>
        public List<Entity> InfoCardItems { get; set; }

        /// <summary>Translated string values keyed by entity:recordId:fieldName for the target language.</summary>
        public TranslationMap TranslationMap { get; set; }

        /// <summary>All active qdb_language_config records (used to enumerate per-language publish runs).</summary>
        public List<Entity> Languages { get; set; }
    }
}
