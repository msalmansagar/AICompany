using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Composes the <c>subject</c> of a <c>qdb_collectionactivity</c> from the activity type it
    /// references, so every activity reads consistently in timelines and queues without the user
    /// typing a subject.
    ///
    /// The activity type is a lookup onto <c>qdb_collectionactivitytype</c>, not a choice column:
    /// activity types are reference data QDB maintains, so the label comes from the record rather
    /// than from option-set codes compiled into this assembly. When the caller has already supplied
    /// a subject it is left untouched.
    ///
    /// Registered: PreOperation, Synchronous — modifies Target before the platform
    /// persists the record.
    /// </summary>
    public sealed class ActivitySubjectComposer
    {
        private const string EntityActivity = "qdb_collectionactivity";
        private const string EntityActivityType = "qdb_collectionactivitytype";
        private const string AttrActivityType = "qdb_activitytypeid";
        private const string AttrActivityTypeName = "qdb_name";
        private const string AttrSubject = "subject";
        private const string FallbackTypeLabel = "Collection Activity";

        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>
        /// Initialises the composer with the three required SDK services.
        /// </summary>
        public ActivitySubjectComposer(
            IOrganizationService service,
            ITracingService tracing,
            IPluginExecutionContext context)
        {
            _service = service;
            _tracing = tracing;
            _context = context;
        }

        /// <summary>Writes the composed subject to the Target entity in InputParameters.</summary>
        public void ComposeSubject()
        {
            if (_context.PrimaryEntityName != EntityActivity) return;

            var target = (Entity)_context.InputParameters["Target"];
            if (HasSubject(target))
            {
                _tracing.Trace("ActivitySubjectComposer: subject already supplied, left untouched");
                return;
            }

            var subject = $"{ResolveActivityTypeName(target)} – {DateTime.UtcNow:yyyy-MM-dd}";
            target[AttrSubject] = subject;
            _tracing.Trace($"ActivitySubjectComposer: subject set to '{subject}'");
        }

        private static bool HasSubject(Entity target) =>
            !string.IsNullOrWhiteSpace(target.GetAttributeValue<string>(AttrSubject));

        /// <summary>
        /// Returns the activity type's name, preferring the name the platform already carries on the
        /// lookup and falling back to a single-column Retrieve. An activity with no type yet — the
        /// column is required at application level, so this is a programmatic create — gets a
        /// generic label rather than an exception.
        /// </summary>
        private string ResolveActivityTypeName(Entity target)
        {
            var activityType = target.GetAttributeValue<EntityReference>(AttrActivityType);
            if (activityType == null)
            {
                _tracing.Trace("ActivitySubjectComposer: no activity type on target, using fallback label");
                return FallbackTypeLabel;
            }

            if (!string.IsNullOrWhiteSpace(activityType.Name)) return activityType.Name;

            var record = _service.Retrieve(
                EntityActivityType, activityType.Id, new ColumnSet(AttrActivityTypeName));
            var name = record.GetAttributeValue<string>(AttrActivityTypeName);
            return string.IsNullOrWhiteSpace(name) ? FallbackTypeLabel : name;
        }
    }
}
