using Microsoft.Xrm.Sdk;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Blocks Update and Delete on immutable entity rows (FR-017, 025, 047, 075, 110).
    ///
    /// Rules:
    /// <list type="bullet">
    ///   <item><c>qdb_delinquencysnapshot</c> — always immutable (append-only MIS record).</item>
    ///   <item><c>qdb_collectionactivity</c> — immutable once <c>statecode = Completed</c>
    ///     (native CRM value 1). Collection actions and promises to pay are all activities in the
    ///     canonical schema, so one rule covers them.</item>
    ///   <item><c>qdb_collectioncase</c> — Delete permanently blocked (sysadmin included, FR-025);
    ///     Update is allowed (status transitions and queue moves are normal operations).</item>
    /// </list>
    ///
    /// There is no audit-log rule: the canonical schema uses the platform's native audit rather
    /// than a platform-owned audit table, and native audit records are immutable by construction.
    ///
    /// The guard does NOT examine the caller's security role. Removing the Delete privilege
    /// from a role is necessary but not sufficient — a system administrator retains Delete
    /// through role bypass. Only a plugin running in isolated sandbox mode can block sysadmin
    /// (AR-04; §4.5).
    ///
    /// Registered: PreValidation, Synchronous — earliest stage, rolls back before the platform
    /// validates or persists the write. Uses a PreImage named "PreImage" containing
    /// <c>statecode</c> for activity entities.
    /// </summary>
    public sealed class ImmutabilityGuard
    {
        private const string EntitySnapshot = "qdb_delinquencysnapshot";
        private const string EntityActivity = "qdb_collectionactivity";
        private const string EntityCase = "qdb_collectioncase"; // FR-025 — Delete blocking
        private const string PreImageAlias = "PreImage";
        private const int StateCodeCompleted = 1; // native CRM: 0=Open, 1=Completed, 2=Canceled

        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>
        /// Initialises the guard with the three required SDK services.
        /// <paramref name="service"/> is accepted for interface consistency but not used —
        /// all data comes from the execution context and pre-images.
        /// </summary>
        public ImmutabilityGuard(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _ = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>
        /// Checks the immutability rule for the current entity.
        /// Throws <see cref="InvalidPluginExecutionException"/> when the operation is blocked.
        /// </summary>
        public void Guard()
        {
            var entityName = _context.PrimaryEntityName;
            _tracing.Trace($"ImmutabilityGuard: checking {entityName} / {_context.MessageName}");

            switch (entityName)
            {
                case EntitySnapshot:
                    ThrowAlwaysImmutable(entityName);
                    break;

                case EntityActivity:
                    GuardCompletedActivity();
                    break;

                case EntityCase:
                    // Delete on collection cases is permanently blocked (sysadmin included, FR-025).
                    // Update is permitted — status transitions and queue reassignments are normal operations.
                    if (_context.MessageName == "Delete")
                        ThrowAlwaysImmutable(entityName);
                    break;
            }
        }

        private void ThrowAlwaysImmutable(string entityName)
        {
            var message = $"'{entityName}' records are permanently immutable and cannot be modified or deleted.";
            _tracing.Trace($"ImmutabilityGuard: blocking — {message}");
            throw new InvalidPluginExecutionException(message);
        }

        private void GuardCompletedActivity()
        {
            if (!_context.PreEntityImages.Contains(PreImageAlias)) return;

            var preImage = _context.PreEntityImages[PreImageAlias];
            var stateCode = preImage.GetAttributeValue<OptionSetValue>("statecode")?.Value;

            if (stateCode == StateCodeCompleted)
                ThrowCompletedActivityImmutable();
        }

        private void ThrowCompletedActivityImmutable()
        {
            var message = "Completed activities cannot be modified or deleted.";
            _tracing.Trace($"ImmutabilityGuard: blocking completed activity — {message}");
            throw new InvalidPluginExecutionException(message);
        }
    }
}