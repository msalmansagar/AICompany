using System;
using Microsoft.Xrm.Sdk;
using Moq;
using Qdb.FormEngine.Plugins;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Unit tests for <see cref="AuditImmutabilityPlugin"/>.
    /// Verifies that Update and Delete on qdb_dfe_audit_log are always rejected,
    /// regardless of the calling user's security role.
    /// </summary>
    public sealed class AuditImmutabilityPluginTests
    {
        private const string AuditLogEntity = "qdb_dfe_audit_log";

        private readonly AuditImmutabilityPlugin _plugin;
        private readonly Mock<ITracingService> _tracingServiceMock;

        /// <summary>Initialises the system under test and shared mocks.</summary>
        public AuditImmutabilityPluginTests()
        {
            _plugin = new AuditImmutabilityPlugin();
            _tracingServiceMock = new Mock<ITracingService>();
        }

        // ------------------------------------------------------------------
        // Update — must always throw
        // ------------------------------------------------------------------

        [Fact]
        public void Execute_UpdateOnAuditLog_ThrowsInvalidPluginExecutionException()
        {
            // Arrange
            var serviceProvider = BuildServiceProvider("Update", AuditLogEntity);

            // Act & Assert
            var exception = Assert.Throws<InvalidPluginExecutionException>(
                () => _plugin.Execute(serviceProvider));

            Assert.Contains("immutable", exception.Message, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Execute_UpdateOnAuditLog_ExceptionMessageNamesTheEntity()
        {
            // Arrange
            var serviceProvider = BuildServiceProvider("Update", AuditLogEntity);

            // Act & Assert
            var exception = Assert.Throws<InvalidPluginExecutionException>(
                () => _plugin.Execute(serviceProvider));

            Assert.Contains(AuditLogEntity, exception.Message, StringComparison.OrdinalIgnoreCase);
        }

        // ------------------------------------------------------------------
        // Delete — must always throw
        // ------------------------------------------------------------------

        [Fact]
        public void Execute_DeleteOnAuditLog_ThrowsInvalidPluginExecutionException()
        {
            // Arrange
            var serviceProvider = BuildServiceProvider("Delete", AuditLogEntity);

            // Act & Assert
            Assert.Throws<InvalidPluginExecutionException>(
                () => _plugin.Execute(serviceProvider));
        }

        [Fact]
        public void Execute_DeleteOnAuditLog_ExceptionMessageNamesTheEntity()
        {
            // Arrange
            var serviceProvider = BuildServiceProvider("Delete", AuditLogEntity);

            // Act & Assert
            var exception = Assert.Throws<InvalidPluginExecutionException>(
                () => _plugin.Execute(serviceProvider));

            Assert.Contains(AuditLogEntity, exception.Message, StringComparison.OrdinalIgnoreCase);
        }

        // ------------------------------------------------------------------
        // Create — must NOT throw (audit log writes must succeed)
        // ------------------------------------------------------------------

        [Fact]
        public void Execute_CreateOnAuditLog_DoesNotThrow()
        {
            // Arrange
            var serviceProvider = BuildServiceProvider("Create", AuditLogEntity);

            // Act — no exception expected
            // Create is the only permitted operation on qdb_dfe_audit_log
            var exception = Record.Exception(() => _plugin.Execute(serviceProvider));

            Assert.Null(exception);
        }

        // ------------------------------------------------------------------
        // Other entities — Update / Delete must NOT be blocked
        // ------------------------------------------------------------------

        [Fact]
        public void Execute_UpdateOnDifferentEntity_DoesNotThrow()
        {
            // Arrange — a different entity (e.g. form definition) must not be blocked
            var serviceProvider = BuildServiceProvider("Update", "qdb_form_definition");

            // Act
            var exception = Record.Exception(() => _plugin.Execute(serviceProvider));

            Assert.Null(exception);
        }

        [Fact]
        public void Execute_DeleteOnDifferentEntity_DoesNotThrow()
        {
            // Arrange
            var serviceProvider = BuildServiceProvider("Delete", "qdb_form_field");

            // Act
            var exception = Record.Exception(() => _plugin.Execute(serviceProvider));

            Assert.Null(exception);
        }

        // ------------------------------------------------------------------
        // Null guard
        // ------------------------------------------------------------------

        [Fact]
        public void Execute_NullServiceProvider_ThrowsArgumentNullException()
        {
            // Act & Assert
            Assert.Throws<ArgumentNullException>(() => _plugin.Execute(null));
        }

        // ------------------------------------------------------------------
        // Defense-in-depth: System Administrator is also blocked
        // The plugin runs in Pre-Validation, before security role checks,
        // so the calling user context is irrelevant — the block is unconditional.
        // This test verifies the block fires for any userId, simulating admin.
        // ------------------------------------------------------------------

        [Fact]
        public void Execute_UpdateOnAuditLogBySystemAdmin_ThrowsInvalidPluginExecutionException()
        {
            // Arrange — simulate a call from a system administrator user
            var systemAdminUserId = new Guid("00000001-0000-0000-0000-000000000001");
            var serviceProvider = BuildServiceProvider("Update", AuditLogEntity, systemAdminUserId);

            // Act & Assert — the block is unconditional regardless of caller
            Assert.Throws<InvalidPluginExecutionException>(
                () => _plugin.Execute(serviceProvider));
        }

        // ------------------------------------------------------------------
        // Test builder
        // ------------------------------------------------------------------

        private IServiceProvider BuildServiceProvider(
            string messageName,
            string entityName,
            Guid? initiatingUserId = null)
        {
            var contextMock = new Mock<IPluginExecutionContext>();
            contextMock.Setup(c => c.MessageName).Returns(messageName);
            contextMock.Setup(c => c.PrimaryEntityName).Returns(entityName);
            contextMock.Setup(c => c.Depth).Returns(1);
            contextMock.Setup(c => c.InitiatingUserId)
                       .Returns(initiatingUserId ?? Guid.NewGuid());

            var serviceProviderMock = new Mock<IServiceProvider>();
            serviceProviderMock
                .Setup(sp => sp.GetService(typeof(IPluginExecutionContext)))
                .Returns(contextMock.Object);
            serviceProviderMock
                .Setup(sp => sp.GetService(typeof(ITracingService)))
                .Returns(_tracingServiceMock.Object);

            return serviceProviderMock.Object;
        }
    }
}
