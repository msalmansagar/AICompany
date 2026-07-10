using System;
using Microsoft.Xrm.Sdk;

namespace Qdb.FormEngine.Plugins
{
    // =========================================================================
    // PLUGIN REGISTRATION SPECIFICATION (ENT-005 / DFE-ENH-001)
    // =========================================================================
    // Register TWO plugin steps from this single class — one per blocked message.
    // DO NOT deploy to org; this source is the authoritative registration spec.
    //
    // Step 1 — Block Update
    //   Assembly:          Qdb.FormEngine.Plugins (ILMerged / registered assembly)
    //   Plugin type:       Qdb.FormEngine.Plugins.AuditImmutabilityPlugin
    //   Message:           Update
    //   Primary entity:    qdb_dfe_audit_log
    //   Stage:             10 (Pre-Validation)  <-- MUST be Pre-Validation, not Pre-Operation
    //   Execution mode:    Synchronous
    //   Filtering attrs:   (none — block ALL Update attempts regardless of which col changed)
    //   Run in user ctx:   Calling user
    //   Rank:              1
    //   Secure config:     (none required)
    //   Unsecure config:   (none required)
    //
    // Step 2 — Block Delete
    //   (All fields identical to Step 1 except:)
    //   Message:           Delete
    //
    // WHY Pre-Validation and not Pre-Operation?
    //   Pre-Validation runs before ANY security checks, before any database locks are
    //   acquired, and before any Pre-Operation plugins. This means the block fires even
    //   when the calling context is System Administrator, Dataverse Admin, or a privileged
    //   service account — because the CRM security role check has not yet been consulted
    //   at this stage. Pre-Operation runs after security but before the commit; System
    //   Administrator can still execute at that stage. The CEO-approved design mandates
    //   that System Administrator is also blocked at the execution level (defense-in-depth
    //   with the role-level no-Update/no-Delete setting). Pre-Validation achieves this.
    //   This design was specifically commended by the CEO during the architecture checkpoint.
    //
    // VERIFICATION TEST
    //   After registration, verify immutability by attempting:
    //     PATCH /api/data/v9.2/qdb_dfe_audit_logs(<any-guid>)
    //       { "qdb_field_schema_name": "tamper" }
    //   Expected: HTTP 400 with error message containing "immutable".
    //
    //   DELETE /api/data/v9.2/qdb_dfe_audit_logs(<any-guid>)
    //   Expected: HTTP 400 with error message containing "immutable".
    //
    //   Both tests must also be repeated while authenticated as System Administrator.
    // =========================================================================

    /// <summary>
    /// Pre-Validation plugin that blocks all Update and Delete operations on
    /// <c>qdb_dfe_audit_log</c>, making audit records immutable at the Dataverse
    /// execution layer.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Audit log records must be append-only per DFE-ENH-001 ENT-005 and
    /// Article VI of the Maqsad AI Technology Constitution. This plugin enforces
    /// immutability regardless of the caller's security role, including System
    /// Administrator. The combination of this plugin (execution-level block) and
    /// the Dataverse security role configuration (no Update/Delete privilege on any
    /// custom role) provides defence-in-depth: neither path alone is sufficient.
    /// </para>
    /// <para>
    /// Register this plugin at <b>Pre-Validation stage</b> for both the
    /// <c>Update</c> and <c>Delete</c> messages on <c>qdb_dfe_audit_log</c>.
    /// See the registration specification in the source comments above.
    /// </para>
    /// </remarks>
    public sealed class AuditImmutabilityPlugin : IPlugin
    {
        private const string AuditLogEntityName = "qdb_dfe_audit_log";

        private const string ImmutabilityMessage =
            "DFE audit log records are immutable. Update and Delete operations are not permitted " +
            "on qdb_dfe_audit_log. This restriction applies to all security roles including " +
            "System Administrator (enforced at the plugin execution level per ENT-005).";

        /// <summary>
        /// Entry point called by the CRM plugin pipeline.
        /// Throws <see cref="InvalidPluginExecutionException"/> for Update and Delete
        /// on <see cref="AuditLogEntityName"/>, unconditionally.
        /// </summary>
        /// <param name="serviceProvider">CRM service provider from the plugin pipeline.</param>
        /// <exception cref="ArgumentNullException">
        /// Thrown when <paramref name="serviceProvider"/> is null.
        /// </exception>
        /// <exception cref="InvalidPluginExecutionException">
        /// Always thrown when the message is Update or Delete on the audit log entity.
        /// </exception>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null)
                throw new ArgumentNullException("serviceProvider");

            var executionContext = ResolveExecutionContext(serviceProvider);
            var tracingService   = ResolveTracingService(serviceProvider);

            LogAttempt(tracingService, executionContext);

            if (IsBlockedOperation(executionContext))
                throw new InvalidPluginExecutionException(ImmutabilityMessage);
        }

        private static IPluginExecutionContext ResolveExecutionContext(IServiceProvider serviceProvider)
        {
            return (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        }

        private static ITracingService ResolveTracingService(IServiceProvider serviceProvider)
        {
            return (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        }

        private static void LogAttempt(ITracingService tracingService, IPluginExecutionContext context)
        {
            tracingService.Trace(
                "AuditImmutabilityPlugin: blocked {0} on {1} by user {2} (depth={3}).",
                context.MessageName,
                context.PrimaryEntityName,
                context.InitiatingUserId,
                context.Depth);
        }

        private static bool IsBlockedOperation(IPluginExecutionContext context)
        {
            var isAuditLogEntity = string.Equals(
                context.PrimaryEntityName,
                AuditLogEntityName,
                StringComparison.OrdinalIgnoreCase);

            var isDestructiveMessage =
                string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(context.MessageName, "Delete", StringComparison.OrdinalIgnoreCase);

            return isAuditLogEntity && isDestructiveMessage;
        }
    }
}
