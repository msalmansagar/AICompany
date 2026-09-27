using Microsoft.Xrm.Sdk;

namespace Qdb.DebtCollection.Plugins.Plugins
{
    /// <summary>
    /// Automated collection work must be able to say why it exists (KI-71).
    ///
    /// A Collection Activity marked <c>Strategy generated</c> must name the Strategy Action that
    /// requested it. An activity that claims to be automated while carrying no provenance is
    /// untraceable work appearing on a customer's file, with nothing for the officer it lands on —
    /// or an auditor asking "why does this exist?" — to appeal to.
    ///
    /// This is registered server-side rather than left to the workspace because React is not an
    /// authorisation boundary. The browser, an import, a script and a future background service all
    /// write through the platform, and only a plugin holds the rule for every one of them. The
    /// domain layer enforces the same invariant in <c>strategyAutomation.ts</c>; the two agree by
    /// construction because both read the same provisioned option value, asserted by a parity test.
    ///
    /// Three things it deliberately does NOT do:
    ///
    /// <list type="bullet">
    /// <item>It does not require provenance. An activity created before Phase 8 carries neither
    /// column, and demanding a value nobody recorded would make the guard unable to run against the
    /// organisation it exists to protect.</item>
    /// <item>It does not forbid a <c>Manual</c> activity from carrying a Strategy Action. That is an
    /// officer accepting planned work, which is real and worth recording. Only the automated
    /// direction is constrained.</item>
    /// <item>It does not infer origin from the lookup. A null origin means "predates provenance",
    /// never "manual", and this guard never writes one.</item>
    /// </list>
    ///
    /// Registered PreOperation, Synchronous, on Create and on Update of
    /// <c>qdb_collectionactivity</c>, with a PreImage carrying <c>qdb_origin</c> and
    /// <c>qdb_strategyactionid</c> — because an Update that clears the lookup on an activity that is
    /// already strategy generated is exactly as damaging as a Create with neither, and the Target
    /// alone cannot show it.
    /// </summary>
    public sealed class ActivityProvenanceGuard
    {
        private const string AttrOrigin = "qdb_origin";
        private const string AttrStrategyAction = "qdb_strategyactionid";
        private const string PreImageAlias = "PreImage";

        /// <summary>
        /// The provisioned value for <c>Strategy generated</c>.
        ///
        /// Written explicitly, and asserted against the TypeScript constant by a parity test. A
        /// number that meant one thing in the browser and another in the platform is the drift this
        /// guard would otherwise be blind to.
        /// </summary>
        public const int OriginStrategyGenerated = 100000801;

        /// <summary>The provisioned value for <c>Manual</c>. Present so the pair is legible here.</summary>
        public const int OriginManual = 100000800;

        private readonly ITracingService _tracing;
        private readonly IPluginExecutionContext _context;

        /// <summary>Initialises the guard with the SDK services it reads.</summary>
        public ActivityProvenanceGuard(ITracingService tracing, IPluginExecutionContext context)
        {
            _tracing = tracing;
            _context = context;
        }

        /// <summary>
        /// Throws <see cref="InvalidPluginExecutionException"/> when the write would leave a
        /// strategy-generated activity with no originating Strategy Action.
        /// </summary>
        public void Guard()
        {
            if (!(_context.InputParameters.Contains("Target")
                  && _context.InputParameters["Target"] is Entity target))
            {
                return;
            }

            var preImage = ReadPreImage();

            // The resulting state, not the delta. An Update that sets only the origin, and an
            // Update that clears only the lookup, are both invisible if the Target is read alone.
            var origin = Resolve(target, preImage, AttrOrigin);
            var strategyAction = Resolve(target, preImage, AttrStrategyAction);

            if (!IsStrategyGenerated(origin)) return;
            if (strategyAction != null) return;

            _tracing.Trace(
                "ActivityProvenanceGuard: refusing a strategy-generated activity with no {0}.",
                AttrStrategyAction);

            throw new InvalidPluginExecutionException(
                "This activity is marked as created by the collection strategy, but it does not "
                + "record which planned action asked for it. Automated work has to be explainable: "
                + "without that link nobody can answer why the activity exists. "
                + "Set the originating strategy action, or record the activity as created by an officer.");
        }

        /// <summary>The PreImage when the platform supplied one; otherwise null.</summary>
        private Entity ReadPreImage()
        {
            return _context.PreEntityImages != null
                   && _context.PreEntityImages.Contains(PreImageAlias)
                ? _context.PreEntityImages[PreImageAlias]
                : null;
        }

        /// <summary>
        /// The value the record will hold after this write.
        ///
        /// A Target that carries the attribute wins, **including when it carries an explicit null** —
        /// that is how a lookup is cleared, and treating a cleared lookup as "unchanged" would let
        /// the one Update this guard most needs to catch straight through.
        /// </summary>
        private static object Resolve(Entity target, Entity preImage, string attribute)
        {
            if (target.Contains(attribute)) return target[attribute];
            return preImage != null && preImage.Contains(attribute) ? preImage[attribute] : null;
        }

        /// <summary>True when the resolved origin is the provisioned strategy-generated value.</summary>
        private static bool IsStrategyGenerated(object origin)
        {
            return origin is OptionSetValue option && option.Value == OriginStrategyGenerated;
        }
    }
}
