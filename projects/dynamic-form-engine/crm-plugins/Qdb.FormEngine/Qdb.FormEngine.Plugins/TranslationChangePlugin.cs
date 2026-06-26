using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.FormEngine.Data;

namespace Qdb.FormEngine.Plugins
{
    // Plugin Registration:
    // Entity:              qdb_translation
    // Message:             Update
    // Stage:               40 (PostOperation)
    // Mode:                Asynchronous
    // Filtering Attribute: qdb_translated_value
    // Pre-Image:           "PreImage" — fields: qdb_entity_name, qdb_record_id, qdb_language_code
    // Purpose: When a translation value changes, creates a new publish job
    //          so the affected form is re-published in the changed language.

    /// <summary>
    /// Asynchronous PostOperation plugin on qdb_translation updates.
    /// When a translated string changes, identifies the affected form and
    /// creates a new qdb_publish_job to trigger re-publication of that language.
    /// Does not throw on resolution failures — traces and returns to avoid blocking.
    /// </summary>
    public sealed class TranslationChangePlugin : PluginBase
    {
        /// <summary>
        /// Initialises a new instance with the secure config supplied during plugin registration.
        /// </summary>
        /// <param name="secureConfig">JSON secure config string.</param>
        public TranslationChangePlugin(string secureConfig) : base(secureConfig) { }

        /// <summary>
        /// Resolves the affected form and schedules a re-publish job for the changed language.
        /// Traces and exits gracefully if the form cannot be resolved.
        /// </summary>
        /// <param name="context">The resolved plugin context.</param>
        protected override void Execute(LocalPluginContext context)
        {
            context.TracingService.Trace("TranslationChangePlugin: processing translation update.");

            var preImage = ReadPreImage(context);
            if (preImage == null)
            {
                context.TracingService.Trace("Pre-image 'PreImage' not registered. Cannot resolve affected form. Exiting.");
                return;
            }

            var entityName = preImage.GetAttributeValue<string>("qdb_entity_name");
            var recordIdRaw = preImage.GetAttributeValue<string>("qdb_record_id");
            var languageCode = ReadLanguageCode(context, preImage);

            if (string.IsNullOrWhiteSpace(entityName) || string.IsNullOrWhiteSpace(recordIdRaw))
            {
                context.TracingService.Trace("Pre-image missing qdb_entity_name or qdb_record_id. Exiting.");
                return;
            }

            Guid recordId;
            if (!Guid.TryParse(recordIdRaw, out recordId))
            {
                context.TracingService.Trace("qdb_record_id '{0}' is not a valid GUID. Exiting.", recordIdRaw);
                return;
            }

            context.TracingService.Trace("Translation changed on entity '{0}', record '{1}', language '{2}'.",
                entityName, recordId, languageCode);

            var formCode = ResolveFormCode(context, entityName, recordId);
            if (string.IsNullOrWhiteSpace(formCode))
            {
                context.TracingService.Trace("Could not resolve form code from entity '{0}' record '{1}'. Exiting.",
                    entityName, recordId);
                return;
            }

            context.TracingService.Trace("Resolved form code: '{0}'. Creating publish job.", formCode);
            CreatePublishJob(context, formCode, languageCode);
        }

        private Entity ReadPreImage(LocalPluginContext context)
        {
            if (!context.Context.PreEntityImages.Contains("PreImage"))
                return null;
            return context.Context.PreEntityImages["PreImage"];
        }

        private string ReadLanguageCode(LocalPluginContext context, Entity preImage)
        {
            var target = context.Context.InputParameters.Contains("Target")
                ? context.Context.InputParameters["Target"] as Entity
                : null;

            if (target != null && target.Contains("qdb_language_code"))
                return target.GetAttributeValue<string>("qdb_language_code");

            if (preImage.Contains("qdb_language_code"))
                return preImage.GetAttributeValue<string>("qdb_language_code");

            return DefaultLanguageCode;
        }

        private string ResolveFormCode(LocalPluginContext context, string entityName, Guid recordId)
        {
            try
            {
                return ResolveFormCodeFromEntity(context.OrganizationService, entityName, recordId);
            }
            catch (Exception ex)
            {
                context.TracingService.Trace("Error resolving form code: {0}", ex.Message);
                return null;
            }
        }

        private string ResolveFormCodeFromEntity(IOrganizationService service, string entityName, Guid recordId)
        {
            // Walk up the entity hierarchy to the parent form definition
            // then read its qdb_form_code.
            var formDefinitionId = ResolveFormDefinitionId(service, entityName, recordId);
            if (formDefinitionId == Guid.Empty) return null;

            var formDef = service.Retrieve("qdb_form_definition", formDefinitionId,
                new ColumnSet("qdb_form_code", "qdb_version"));
            return formDef.GetAttributeValue<string>("qdb_form_code");
        }

        private Guid ResolveFormDefinitionId(IOrganizationService service, string entityName, Guid recordId)
        {
            // Direct lookup if the translated entity is the form definition itself.
            if (string.Equals(entityName, "qdb_form_definition", StringComparison.OrdinalIgnoreCase))
                return recordId;

            // For child entities, retrieve the record and walk up via lookup attribute.
            var parentAttributeName = GetFormDefinitionLookupAttribute(entityName);
            if (string.IsNullOrEmpty(parentAttributeName)) return ResolveViaTab(service, entityName, recordId);

            var record = service.Retrieve(entityName, recordId, new ColumnSet(parentAttributeName));
            if (!record.Contains(parentAttributeName)) return Guid.Empty;

            var parentRef = record.GetAttributeValue<EntityReference>(parentAttributeName);
            return parentRef?.Id ?? Guid.Empty;
        }

        private Guid ResolveViaTab(IOrganizationService service, string entityName, Guid recordId)
        {
            // For section/field/option entities that link through tab -> form, walk the chain.
            if (string.Equals(entityName, "qdb_form_section", StringComparison.OrdinalIgnoreCase))
            {
                var section = service.Retrieve(entityName, recordId, new ColumnSet("_qdb_form_tab_id_value"));
                var tabRef = section.GetAttributeValue<EntityReference>("_qdb_form_tab_id_value");
                if (tabRef == null) return Guid.Empty;
                var tab = service.Retrieve("qdb_form_tab", tabRef.Id, new ColumnSet("_qdb_form_definition_id_value"));
                var formRef = tab.GetAttributeValue<EntityReference>("_qdb_form_definition_id_value");
                return formRef?.Id ?? Guid.Empty;
            }

            if (string.Equals(entityName, "qdb_form_field", StringComparison.OrdinalIgnoreCase))
            {
                var field = service.Retrieve(entityName, recordId, new ColumnSet("_qdb_form_section_id_value"));
                var sectionRef = field.GetAttributeValue<EntityReference>("_qdb_form_section_id_value");
                if (sectionRef == null) return Guid.Empty;
                return ResolveViaTab(service, "qdb_form_section", sectionRef.Id);
            }

            return Guid.Empty;
        }

        private static string GetFormDefinitionLookupAttribute(string entityName)
        {
            switch (entityName.ToLowerInvariant())
            {
                case "qdb_form_tab": return "_qdb_form_definition_id_value";
                case "qdb_form_button": return "_qdb_form_definition_id_value";
                case "qdb_form_submission_mapping": return "_qdb_form_definition_id_value";
                case "qdb_form_business_rule": return "_qdb_form_definition_id_value";
                case "qdb_info_card_screen": return "_qdb_form_definition_id_value";
                default: return null;
            }
        }

        private void CreatePublishJob(LocalPluginContext context, string formCode, string languageCode)
        {
            var metadataReader = new CrmMetadataReader(context.OrganizationService);
            var rawData = metadataReader.ReadFormRawData(formCode);
            var formVersion = rawData.FormEntity.GetAttributeValue<int>("qdb_version");
            var formDefinitionId = rawData.FormEntity.Id;

            var publishJobRepo = new PublishJobRepository(context.OrganizationService);
            publishJobRepo.CreateJob(formCode, formVersion, "TranslationUpdate", languageCode, formDefinitionId);

            context.TracingService.Trace("Publish job created for form '{0}', language '{1}'.", formCode, languageCode);
        }
    }
}
