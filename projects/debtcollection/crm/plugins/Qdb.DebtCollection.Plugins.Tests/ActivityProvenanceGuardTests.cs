using System;
using Microsoft.Xrm.Sdk;
using Qdb.DebtCollection.Plugins.Plugins;
using Qdb.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// Automated collection work must be able to say why it exists (KI-71).
    ///
    /// The rule is one-directional and deliberately narrow: strategy-generated work must name its
    /// Strategy Action; manual work may name one; work that predates provenance must be left
    /// entirely alone. Each test below names the failure it prevents.
    /// </summary>
    public sealed class ActivityProvenanceGuardTests
    {
        private const string EntityActivity = "qdb_collectionactivity";
        private const string AttrOrigin = "qdb_origin";
        private const string AttrStrategyAction = "qdb_strategyactionid";

        private static readonly Guid ActivityId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private static readonly Guid ActionId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

        // ── Create ────────────────────────────────────────────────────────────

        [Fact]
        public void Guard_CreateStrategyGeneratedWithoutAction_Throws()
        {
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginStrategyGenerated);

            var ex = Assert.Throws<InvalidPluginExecutionException>(() => Guard(target).Guard());

            Assert.Contains("collection strategy", ex.Message);
        }

        [Fact]
        public void Guard_CreateStrategyGeneratedWithAction_Allows()
        {
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginStrategyGenerated);
            target[AttrStrategyAction] = new EntityReference("qdb_strategyaction", ActionId);

            Assert.Null(Record.Exception(() => Guard(target).Guard()));
        }

        [Fact]
        public void Guard_CreateManualWithAction_Allows()
        {
            // An officer accepting planned work. Real, useful to record, and not a contradiction.
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginManual);
            target[AttrStrategyAction] = new EntityReference("qdb_strategyaction", ActionId);

            Assert.Null(Record.Exception(() => Guard(target).Guard()));
        }

        [Fact]
        public void Guard_CreateWithNoProvenanceAtAll_Allows()
        {
            // Every Phase 6 and Phase 7 activity is this shape. A guard that demanded a value
            // nobody recorded could not run against the organisation it exists to protect.
            var target = new Entity(EntityActivity, ActivityId);
            target["subject"] = "Manual call";

            Assert.Null(Record.Exception(() => Guard(target).Guard()));
        }

        [Fact]
        public void Guard_CreateWithActionButNoOrigin_Allows()
        {
            // A lone lookup is not a claim of automation, so there is nothing to enforce.
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrStrategyAction] = new EntityReference("qdb_strategyaction", ActionId);

            Assert.Null(Record.Exception(() => Guard(target).Guard()));
        }

        // ── Update: the resulting state, not the delta ────────────────────────

        [Fact]
        public void Guard_UpdateSetsOriginOnActivityThatAlreadyHasAction_Allows()
        {
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginStrategyGenerated);

            var preImage = new Entity(EntityActivity, ActivityId);
            preImage[AttrStrategyAction] = new EntityReference("qdb_strategyaction", ActionId);

            Assert.Null(Record.Exception(() => Guard(target, preImage).Guard()));
        }

        [Fact]
        public void Guard_UpdateSetsOriginOnActivityWithNoAction_Throws()
        {
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginStrategyGenerated);

            var preImage = new Entity(EntityActivity, ActivityId);
            preImage["subject"] = "Manual call";

            Assert.Throws<InvalidPluginExecutionException>(() => Guard(target, preImage).Guard());
        }

        [Fact]
        public void Guard_UpdateCLEARSTheActionOnStrategyGeneratedActivity_Throws()
        {
            // The Update this guard most needs to catch. An explicit null is how a lookup is
            // cleared; reading the Target alone, or treating a cleared lookup as "unchanged",
            // would let untraceable automated work through the one door left open.
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrStrategyAction] = null;

            var preImage = new Entity(EntityActivity, ActivityId);
            preImage[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginStrategyGenerated);
            preImage[AttrStrategyAction] = new EntityReference("qdb_strategyaction", ActionId);

            Assert.Throws<InvalidPluginExecutionException>(() => Guard(target, preImage).Guard());
        }

        [Fact]
        public void Guard_UpdateChangesOriginToManualAndClearsAction_Allows()
        {
            // Demoting automated work to manual is legitimate and must stay possible.
            var target = new Entity(EntityActivity, ActivityId);
            target[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginManual);
            target[AttrStrategyAction] = null;

            var preImage = new Entity(EntityActivity, ActivityId);
            preImage[AttrOrigin] = new OptionSetValue(ActivityProvenanceGuard.OriginStrategyGenerated);
            preImage[AttrStrategyAction] = new EntityReference("qdb_strategyaction", ActionId);

            Assert.Null(Record.Exception(() => Guard(target, preImage).Guard()));
        }

        [Fact]
        public void Guard_UpdateTouchingNeitherColumnOnHistoricalActivity_Allows()
        {
            var target = new Entity(EntityActivity, ActivityId);
            target["qdb_activitydate"] = DateTime.UtcNow;

            var preImage = new Entity(EntityActivity, ActivityId);
            preImage["subject"] = "Phase 6 activity";

            Assert.Null(Record.Exception(() => Guard(target, preImage).Guard()));
        }

        [Fact]
        public void Guard_NoTarget_DoesNothing()
        {
            var builder = new PluginContextBuilder().WithMessage("Update");
            builder.MockContext.Setup(c => c.InputParameters).Returns(new ParameterCollection());

            var guard = new ActivityProvenanceGuard(builder.Tracing, builder.Context);

            Assert.Null(Record.Exception(() => guard.Guard()));
        }

        // ── Parity with the browser ───────────────────────────────────────────

        [Fact]
        public void OriginValues_MatchTheProvisionedOptionSet()
        {
            // The same numbers the provisioning script wrote and strategyAutomation.ts reads. A
            // value that meant one thing in the platform and another in the browser is drift this
            // guard would otherwise be blind to.
            Assert.Equal(100000800, ActivityProvenanceGuard.OriginManual);
            Assert.Equal(100000801, ActivityProvenanceGuard.OriginStrategyGenerated);
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private static ActivityProvenanceGuard Guard(Entity target, Entity preImage = null)
        {
            var builder = new PluginContextBuilder()
                .WithMessage(preImage == null ? "Create" : "Update")
                .WithEntity(EntityActivity, ActivityId)
                .WithTarget(target);

            if (preImage != null) builder.WithPreImage(preImage);
            else builder.MockContext.Setup(c => c.PreEntityImages).Returns(new EntityImageCollection());

            return new ActivityProvenanceGuard(builder.Tracing, builder.Context);
        }
    }
}
