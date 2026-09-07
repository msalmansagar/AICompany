using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Engine;

namespace Qdb.ReportEngine.CrmPlugin
{
    /// <summary>
    /// Records every change to a report definition in <c>qdb_reportauditlog</c>.
    ///
    /// The engine already proves who READ data: execution goes through qdb_RunReport, so the call
    /// returning rows is the call writing the log. Nothing recorded who CHANGED a definition — a
    /// report could be re-pointed at another table, have its filters removed or its security emptied,
    /// and the trail would show only that it later ran and returned different numbers.
    ///
    /// This closes that half. It runs on the entity rather than in the designer for the same reason
    /// execution logging is not in the browser: an audit the caller can skip by using the Web API
    /// directly is not an audit. Registered synchronously so the record is written in the same
    /// transaction as the change — if the audit cannot be written, the change does not happen.
    ///
    /// The row is created with the system identity, so a user without create privilege on the audit
    /// table still leaves a trail, and owned by the user who made the change, so the trail names
    /// them. Immutability is a matter of privileges on qdb_reportauditlog, not of this code.
    /// </summary>
    public sealed class ReportConfigurationAuditPlugin : IPlugin
    {
        private const string ReportEntity = "qdb_reportdefinition";
        private const string PreImage = "PreImage";

        public ReportConfigurationAuditPlugin(string unsecureConfig, string secureConfig)
        {
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new ArgumentNullException(nameof(serviceProvider));

            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));

            Write(context, tracing, new ReportAuditWriter(factory.CreateOrganizationService(null), tracing));
        }

        internal static void Write(IPluginExecutionContext context, ITracingService tracing, ReportAuditWriter writer)
        {
            var change = Describe(context);
            if (change == null)
            {
                tracing.Trace("qdb_reportauditlog: {0} on {1} carried nothing to record.",
                    context.MessageName, context.PrimaryEntityName);
                return;
            }

            writer.Write(change);
        }

        /// <summary>
        /// Turns the platform's message into what the trail records, or null when there is nothing
        /// worth a row — an update that changed no attribute this plugin can see.
        /// </summary>
        internal static ReportChange Describe(IPluginExecutionContext context)
        {
            var before = context.PreEntityImages != null && context.PreEntityImages.Contains(PreImage)
                ? context.PreEntityImages[PreImage]
                : null;

            switch (context.MessageName)
            {
                case "Create":
                    return Created(context);
                case "Update":
                    return Updated(context, before);
                case "Delete":
                    return Deleted(context, before);
                default:
                    return null;
            }
        }

        private static ReportChange Created(IPluginExecutionContext context)
        {
            var target = TargetEntity(context);
            if (target == null) return null;

            return new ReportChange
            {
                // On create the id is assigned by the platform, so the target may not carry it.
                // PrimaryEntityId is set by the time a post-operation step runs.
                ReportId = FirstNonEmpty(target.Id, OutputId(context), context.PrimaryEntityId),
                ReportName = Text(target, "qdb_name"),
                Action = AuditAction.Create,
                UserId = context.InitiatingUserId,
                After = AuditJson.Write(Meaningful(target.Attributes))
            };
        }

        /// <summary>
        /// An update carries only the attributes that changed, so the diff is those keys read from
        /// both images. Publishing is an update to one boolean, and the option set has its own value
        /// for it — recording that as a plain "Update" would bury the one change an approver looks for.
        /// </summary>
        private static ReportChange Updated(IPluginExecutionContext context, Entity before)
        {
            var target = TargetEntity(context);
            if (target == null || target.Attributes.Count == 0) return null;

            var changed = new List<string>();
            foreach (var key in target.Attributes.Keys)
            {
                if (!IsNoise(key)) changed.Add(key);
            }

            if (changed.Count == 0) return null;

            return new ReportChange
            {
                ReportId = target.Id,
                ReportName = Text(target, "qdb_name") ?? Text(before, "qdb_name"),
                Action = ActionOf(target, before),
                UserId = context.InitiatingUserId,
                Before = before == null ? null : AuditJson.Write(Subset(before, changed)),
                After = AuditJson.Write(Subset(target, changed))
            };
        }

        private static ReportChange Deleted(IPluginExecutionContext context, Entity before)
        {
            var reference = TargetReference(context);
            if (reference == null) return null;

            return new ReportChange
            {
                // Deliberately not linked: the report it points at no longer exists, and Dataverse
                // rejects a lookup to a missing row. The id is preserved in the comment instead.
                ReportId = Guid.Empty,
                DeletedReportId = reference.Id,
                ReportName = Text(before, "qdb_name") ?? reference.Id.ToString(),
                Action = AuditAction.Delete,
                UserId = context.InitiatingUserId,
                Before = before == null ? null : AuditJson.Write(Meaningful(before.Attributes))
            };
        }

        private static int ActionOf(Entity target, Entity before)
        {
            if (!target.Contains("qdb_ispublished")) return AuditAction.Update;

            var nowPublished = target.GetAttributeValue<bool>("qdb_ispublished");
            var wasPublished = before != null && before.GetAttributeValue<bool>("qdb_ispublished");
            if (nowPublished == wasPublished) return AuditAction.Update;
            return nowPublished ? AuditAction.Publish : AuditAction.Unpublish;
        }

        /// <summary>
        /// Attributes the platform stamps on every write, plus the record's own id. Recording them
        /// would make each row look like a change to the record's bookkeeping rather than to the
        /// report — and an id in a before/after diff reads as though the key itself moved.
        /// </summary>
        private static bool IsNoise(string attribute) =>
            attribute == "modifiedon" || attribute == "modifiedby" || attribute == "modifiedonbehalfby"
            || attribute == "qdb_reportdefinitionid";

        private static IEnumerable<KeyValuePair<string, object>> Meaningful(
            IEnumerable<KeyValuePair<string, object>> attributes)
        {
            var kept = new List<KeyValuePair<string, object>>();
            foreach (var attribute in attributes)
            {
                if (!IsNoise(attribute.Key)) kept.Add(attribute);
            }

            return kept;
        }

        private static Guid FirstNonEmpty(params Guid[] candidates)
        {
            foreach (var candidate in candidates)
            {
                if (candidate != Guid.Empty) return candidate;
            }

            return Guid.Empty;
        }

        private static IEnumerable<KeyValuePair<string, object>> Subset(Entity entity, IEnumerable<string> keys)
        {
            var subset = new List<KeyValuePair<string, object>>();
            foreach (var key in keys)
            {
                subset.Add(new KeyValuePair<string, object>(key, entity.Contains(key) ? entity[key] : null));
            }

            return subset;
        }

        private static Entity TargetEntity(IPluginExecutionContext context) =>
            context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;

        private static EntityReference TargetReference(IPluginExecutionContext context) =>
            context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as EntityReference : null;

        private static Guid OutputId(IPluginExecutionContext context) =>
            context.OutputParameters != null && context.OutputParameters.Contains("id")
                ? (Guid)context.OutputParameters["id"]
                : Guid.Empty;

        private static string Text(Entity entity, string attribute) =>
            entity != null && entity.Contains(attribute) ? entity[attribute] as string : null;

        /// <summary>Guards against the plugin being registered on the wrong table by mistake.</summary>
        internal static bool IsReportDefinition(IPluginExecutionContext context) =>
            string.Equals(context.PrimaryEntityName, ReportEntity, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>The qdb_actiontype option set, as the org defines it.</summary>
    internal static class AuditAction
    {
        public const int Create = 100000000;
        public const int Update = 100000001;
        public const int Delete = 100000002;
        public const int Publish = 100000003;
        public const int Unpublish = 100000004;
        public const int Clone = 100000005;
        public const int Approve = 100000006;

        public static string Label(int action)
        {
            switch (action)
            {
                case Create: return "Created";
                case Update: return "Updated";
                case Delete: return "Deleted";
                case Publish: return "Published";
                case Unpublish: return "Unpublished";
                case Clone: return "Cloned";
                case Approve: return "Approved";
                default: return "Changed";
            }
        }
    }

    /// <summary>One configuration change, as the trail records it.</summary>
    internal sealed class ReportChange
    {
        public Guid ReportId { get; set; }

        /// <summary>Set only for a delete, where the report can no longer be linked to.</summary>
        public Guid DeletedReportId { get; set; }

        public string ReportName { get; set; }

        public int Action { get; set; }

        public Guid UserId { get; set; }

        public string Before { get; set; }

        public string After { get; set; }
    }
}
