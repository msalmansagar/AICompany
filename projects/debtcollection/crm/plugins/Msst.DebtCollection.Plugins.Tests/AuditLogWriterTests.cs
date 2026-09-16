using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Msst.DebtCollection.Plugins.Plugins;
using Msst.DebtCollection.Plugins.Tests.Infrastructure;
using Newtonsoft.Json;
using Xunit;

namespace Msst.DebtCollection.Plugins.Tests
{
    public sealed class AuditLogWriterTests
    {
        private const string EntityCase = "msst_dcpcollectioncase";
        private const string EntityAuditLog = "msst_dcpauditlog";

        // ── Create ────────────────────────────────────────────────────────────────

        [Fact]
        public void WriteAuditRow_OnCreate_WritesAuditLogWithMessageNameCreate()
        {
            // Arrange
            var builder = BuildBasicCreate();
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.NotNull(captured);
            Assert.Equal(EntityAuditLog, captured!.LogicalName);
            Assert.Equal("Create", (string)captured["msst_auditaction"]);
        }

        [Fact]
        public void WriteAuditRow_OnCreate_SetsEntityNameAndRecordId()
        {
            // Arrange
            var recordId = Guid.NewGuid();
            var builder = BuildBasicCreate(entityId: recordId);
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal(EntityCase, (string)captured!["msst_entityname"]);
            Assert.Equal(recordId.ToString(), (string)captured["msst_recordid"]);
        }

        [Fact]
        public void WriteAuditRow_OnCreate_OldValueIsEmpty()
        {
            // Arrange — no pre-image for Create
            var builder = BuildBasicCreate();
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal(string.Empty, (string)captured!["msst_oldvalue"]);
        }

        // ── Update ────────────────────────────────────────────────────────────────

        [Fact]
        public void WriteAuditRow_OnUpdate_WritesNonEmptyOldAndNewValues()
        {
            // Arrange
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity(EntityCase, Guid.NewGuid())
                .WithUserId(Guid.NewGuid())
                .WithCorrelationId(Guid.NewGuid());

            var preImage = new Entity(EntityCase);
            preImage["statuscode"] = new OptionSetValue(100000000);
            builder.WithPreImage(preImage);

            var target = new Entity(EntityCase);
            target["statuscode"] = new OptionSetValue(100000001);
            builder.WithTarget(target);

            builder.MockService.Setup(s => s.RetrieveMultiple(It.IsAny<QueryExpression>()))
                .Returns(new EntityCollection());
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            var oldValue = (string)captured!["msst_oldvalue"];
            var newValue = (string)captured["msst_newvalue"];
            Assert.NotEmpty(oldValue);
            Assert.NotEmpty(newValue);
            Assert.NotEqual(oldValue, newValue);
        }

        [Fact]
        public void WriteAuditRow_OnUpdate_OldValueContainsPreImageAttribute()
        {
            // Arrange
            var builder = new PluginContextBuilder()
                .WithMessage("Update")
                .WithEntity(EntityCase, Guid.NewGuid())
                .WithUserId(Guid.NewGuid())
                .WithCorrelationId(Guid.NewGuid());

            var preImage = new Entity(EntityCase);
            preImage["statuscode"] = new OptionSetValue(100000000);
            builder.WithPreImage(preImage);
            builder.WithTarget(new Entity(EntityCase));

            builder.MockService.Setup(s => s.RetrieveMultiple(It.IsAny<QueryExpression>()))
                .Returns(new EntityCollection());
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            var oldValueDict = JsonConvert.DeserializeObject<dynamic>((string)captured!["msst_oldvalue"]);
            Assert.NotNull(oldValueDict!.statuscode);
        }

        // ── Actor ─────────────────────────────────────────────────────────────────

        [Fact]
        public void WriteAuditRow_SetsActorFromCallerUserId()
        {
            // Arrange
            var userId = Guid.NewGuid();
            var builder = BuildBasicCreate(userId: userId);
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal(userId.ToString(), (string)captured!["msst_actor"]);
        }

        [Fact]
        public void WriteAuditRow_SetsActorRoleFromUserRoleQuery_WhenRoleFound()
        {
            // Arrange
            var builder = BuildBasicCreate();
            var roleEntity = new Entity("role") { ["name"] = "Collection Officer" };
            builder.MockService.Setup(s => s.RetrieveMultiple(It.IsAny<QueryExpression>()))
                .Returns(new EntityCollection(new System.Collections.Generic.List<Entity> { roleEntity }));
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal("Collection Officer", (string)captured!["msst_actorrole"]);
        }

        [Fact]
        public void WriteAuditRow_SetsActorRoleToUnknown_WhenNoRoleFound()
        {
            // Arrange
            var builder = BuildBasicCreate();
            builder.MockService.Setup(s => s.RetrieveMultiple(It.IsAny<QueryExpression>()))
                .Returns(new EntityCollection());
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal("Unknown", (string)captured!["msst_actorrole"]);
        }

        // ── Correlation ID ────────────────────────────────────────────────────────

        [Fact]
        public void WriteAuditRow_UsesCorrelationIdFromTargetAttribute_WhenPresent()
        {
            // Arrange
            var routerCorrelationId = "router-trace-abc123";
            var builder = BuildBasicCreate();
            var target = new Entity(EntityCase);
            target["msst_correlationid"] = routerCorrelationId;
            builder.WithTarget(target);
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal(routerCorrelationId, (string)captured!["msst_correlationid"]);
        }

        [Fact]
        public void WriteAuditRow_FallsBackToContextCorrelationId_WhenAttributeAbsent()
        {
            // Arrange
            var crmCorrelationId = Guid.NewGuid();
            var builder = BuildBasicCreate(correlationId: crmCorrelationId);
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal(crmCorrelationId.ToString(), (string)captured!["msst_correlationid"]);
        }

        // ── Source path ───────────────────────────────────────────────────────────

        [Fact]
        public void WriteAuditRow_ReadsSourcePathFromTargetAttribute_WhenPresent()
        {
            // Arrange
            var builder = BuildBasicCreate();
            var target = new Entity(EntityCase);
            target["msst_sourcepath"] = "Router";
            builder.WithTarget(target);
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal("Router", (string)captured!["msst_sourcepath"]);
        }

        [Fact]
        public void WriteAuditRow_DefaultsSourcePathToPlugin_WhenAttributeAbsent()
        {
            // Arrange
            var builder = BuildBasicCreate();
            Entity? captured = null;
            builder.MockService.Setup(s => s.Create(It.IsAny<Entity>()))
                .Callback<Entity>(e => captured = e).Returns(Guid.NewGuid());

            // Act
            CreateWriter(builder).WriteAuditRow();

            // Assert
            Assert.Equal("Plugin", (string)captured!["msst_sourcepath"]);
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static PluginContextBuilder BuildBasicCreate(
            Guid? entityId = null,
            Guid? userId = null,
            Guid? correlationId = null)
        {
            var builder = new PluginContextBuilder()
                .WithMessage("Create")
                .WithEntity(EntityCase, entityId ?? Guid.NewGuid())
                .WithUserId(userId ?? Guid.NewGuid())
                .WithCorrelationId(correlationId ?? Guid.NewGuid())
                .WithTarget(new Entity(EntityCase))
                .WithEmptyPreImages();

            builder.MockService.Setup(s => s.RetrieveMultiple(It.IsAny<QueryExpression>()))
                .Returns(new EntityCollection());

            return builder;
        }

        private static AuditLogWriter CreateWriter(PluginContextBuilder builder) =>
            new AuditLogWriter(builder.Service, builder.Tracing, builder.Context);
    }
}
