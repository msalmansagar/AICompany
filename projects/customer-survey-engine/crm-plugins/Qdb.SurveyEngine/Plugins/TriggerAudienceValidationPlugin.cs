using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// Synchronous pre-operation step on qdb_survey_trigger Create and Update (FR-CSE-091, NFR-CSE-017,
    /// ADR-009). For One-time triggers it refuses a save of the definition by anyone but a Survey Admin or
    /// System Administrator, an unusable audience filter, and audience changes during a send; on create it
    /// starts the run record at Not sent. Other trigger kinds pass untouched.
    /// </summary>
    public sealed class TriggerAudienceValidationPlugin : IPlugin
    {
        private static readonly string[] StoredColumns = { "qdb_trigger_kind", "qdb_audience", "qdb_audience_fetchxml", "qdb_is_active", "qdb_run_status" };

        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (!(context.InputParameters["Target"] is Entity target)) return;
            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            var isCreate = context.MessageName == "Create";
            var stored = isCreate ? new Entity(target.LogicalName) : system.Retrieve(target.LogicalName, target.Id, new ColumnSet(StoredColumns));
            if (KindOf(target, stored) != TriggerKind.OneTime) return;
            if (isCreate && !target.Contains("qdb_run_status")) target["qdb_run_status"] = new OptionSetValue((int)OneTimeRunStatus.NotSent);
            var save = isCreate ? BuildCreate(target) : BuildUpdate(target, stored);
            if (!OneTimeTriggerRules.TouchesDefinition(save)) return;
            save.IsCallerSurveyAdmin = new OneTimeAccessCheck(system, new AdministratorCheck(system)).MaySendSurveys(context.InitiatingUserId);
            var problem = OneTimeTriggerRules.FindProblem(save, CustomerLinkReader.Read(system).TableLogicalName);
            if (problem != null) throw new InvalidPluginExecutionException(problem);
        }

        private static TriggerKind? KindOf(Entity target, Entity stored) =>
            (TriggerKind?)Merged<OptionSetValue>(target, stored, "qdb_trigger_kind")?.Value;

        // A create has nothing stored yet, so every value comes from the target.
        private static OneTimeTriggerSave BuildCreate(Entity target)
        {
            var save = BuildUpdate(target, new Entity(target.LogicalName));
            save.IsCreate = true;
            return save;
        }

        private static OneTimeTriggerSave BuildUpdate(Entity target, Entity stored) => new OneTimeTriggerSave
        {
            ChangedColumns = new HashSet<string>(target.Attributes.Keys, StringComparer.OrdinalIgnoreCase),
            Audience = (AudienceKind?)Merged<OptionSetValue>(target, stored, "qdb_audience")?.Value ?? AudienceKind.AllActiveCustomers,
            AudienceFetchXml = Merged<string>(target, stored, "qdb_audience_fetchxml"),
            IsActive = Merged<bool?>(target, stored, "qdb_is_active") ?? false,
            Status = (OneTimeRunStatus?)Merged<OptionSetValue>(target, stored, "qdb_run_status")?.Value ?? OneTimeRunStatus.NotSent,
        };

        // The value being saved when the save writes the column (even to empty), else the stored value.
        private static T Merged<T>(Entity target, Entity stored, string column) =>
            target.Contains(column) ? target.GetAttributeValue<T>(column) : stored.GetAttributeValue<T>(column);
    }
}
