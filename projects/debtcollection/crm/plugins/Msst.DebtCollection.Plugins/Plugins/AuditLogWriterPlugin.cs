using Msst.DebtCollection.Plugins.Infrastructure;

namespace Msst.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// CRM plugin shell for <see cref="AuditLogWriter"/>.
    /// Registered on PostOperation, Asynchronous for every tracked entity.
    /// See REGISTRATION.md for the full step table.
    /// </summary>
    public sealed class AuditLogWriterPlugin : PluginBase
    {
        /// <inheritdoc />
        protected override void ExecuteCore(PluginContext context)
        {
            new AuditLogWriter(
                context.OrganizationService,
                context.TracingService,
                context.ExecutionContext)
                .WriteAuditRow();
        }
    }
}
