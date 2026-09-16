using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Writes a single append-only <c>msst_dcpauditlog</c> row per Create or Update
    /// operation on a tracked entity (FR-036, 061, 076, 108, 109, 118).
    ///
    /// Registered: PostOperation, Asynchronous — runs outside the database
    /// transaction so it does not extend the user's wait time.
    ///
    /// Correlation ID: prefers the value of <c>msst_correlationid</c> on the target
    /// entity if the router set it; falls back to <c>IPluginExecutionContext.CorrelationId</c>
    /// (CRM's own request correlation). See REGISTRATION.md §5 for the router convention.
    ///
    /// Source path: reads <c>msst_sourcepath</c> from the target entity if present
    /// (router sets "Router"); defaults to "Plugin" when absent.
    /// </summary>
    public sealed class AuditLogWriter
    {
        private const string EntityAuditLog = "msst_dcpauditlog";
        private const string AttrCorrelationId = "msst_correlationid";
        private const string AttrSourcePath = "msst_sourcepath";
        private const string PreImageAlias = "PreImage";

        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>
        /// Initialises the audit log writer with the three required SDK services.
        /// </summary>
        public AuditLogWriter(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _service = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>Writes a single audit log row for the current operation.</summary>
        public void WriteAuditRow()
        {
            _tracing.Trace("AuditLogWriter: composing audit row");

            var target = (Entity)_context.InputParameters["Target"];
            var auditRow = BuildAuditEntity(target);
            _service.Create(auditRow);

            _tracing.Trace("AuditLogWriter: audit row written");
        }

        private Entity BuildAuditEntity(Entity target)
        {
            var row = new Entity(EntityAuditLog);
            row["msst_name"] = ComposeEntryName();
            row["msst_auditaction"] = _context.MessageName;
            row["msst_entityname"] = _context.PrimaryEntityName;
            row["msst_recordid"] = _context.PrimaryEntityId.ToString();
            row["msst_actor"] = _context.UserId.ToString();
            row["msst_actorrole"] = ResolveActorRoleName();
            row["msst_timestamp"] = DateTime.UtcNow;
            row["msst_newvalue"] = SerializeAttributes(target.Attributes);
            row["msst_oldvalue"] = ReadOldValue();
            row["msst_correlationid"] = ReadCorrelationId(target);
            row["msst_sourcepath"] = ReadSourcePath(target);
            return row;
        }

        private string ReadOldValue()
        {
            if (!_context.PreEntityImages.Contains(PreImageAlias))
                return string.Empty;

            return SerializeAttributes(_context.PreEntityImages[PreImageAlias].Attributes);
        }

        /// <summary>
        /// Composes the primary name as "Message entity id" so audit rows are readable and
        /// filterable by record id without a dedicated index.
        /// </summary>
        private string ComposeEntryName()
        {
            return _context.MessageName + " " + _context.PrimaryEntityName + " " + _context.PrimaryEntityId;
        }

        private string ResolveActorRoleName()
        {
            // Retrieves the primary security role name for the calling user.
            // One extra round-trip is acceptable in an async post-op plugin.
            var query = new QueryExpression("role") { ColumnSet = new ColumnSet("name"), TopCount = 1 };
            var link = query.AddLink("systemuserroles", "roleid", "roleid");
            link.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, _context.UserId);

            var results = _service.RetrieveMultiple(query);
            return results.Entities.Count > 0
                ? results.Entities[0].GetAttributeValue<string>("name") ?? "Unknown"
                : "Unknown";
        }

        private string ReadCorrelationId(Entity target)
        {
            if (target.Contains(AttrCorrelationId))
                return target.GetAttributeValue<string>(AttrCorrelationId) ?? _context.CorrelationId.ToString();

            return _context.CorrelationId.ToString();
        }

        private string ReadSourcePath(Entity target)
        {
            if (target.Contains(AttrSourcePath))
                return target.GetAttributeValue<string>(AttrSourcePath) ?? "Plugin";

            return "Plugin";
        }

        private static string SerializeAttributes(AttributeCollection attributes)
        {
            var dict = new Dictionary<string, object?>();
            foreach (var attr in attributes)
                dict[attr.Key] = NormalizeAttributeValue(attr.Value);

            return JsonConvert.SerializeObject(dict);
        }

        /// <summary>
        /// Reduces SDK value types to plain objects so Newtonsoft can serialise them.
        /// EntityReference and Money do not have default JSON converters.
        /// </summary>
        private static object? NormalizeAttributeValue(object? value) => value switch
        {
            EntityReference er => new { er.LogicalName, Id = er.Id.ToString() },
            OptionSetValue osv => osv.Value,
            Money m => m.Value,
            null => null,
            _ => value.ToString(),
        };
    }
}
