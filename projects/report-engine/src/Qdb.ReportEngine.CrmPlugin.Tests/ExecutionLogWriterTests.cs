using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// The audit record is the reason retrieval runs in the plugin at all, so these cover the two
    /// ways it can quietly stop being a guarantee: written with the wrong attribute types so the
    /// create is rejected, or a rejection that nobody notices.
    /// </summary>
    public sealed class ExecutionLogWriterTests
    {
        private static readonly Guid ReportId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private static readonly Guid UserId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        private static ExecutionLogEntry Entry() => new ExecutionLogEntry
        {
            ReportId = ReportId,
            ReportName = "Active Accounts",
            UserId = UserId,
            CorrelationId = "abc123",
            StartedOn = new DateTime(2026, 7, 27, 9, 30, 0, DateTimeKind.Utc),
            DurationMs = 42,
            RowCount = 5,
            Succeeded = true
        };

        private static Entity WriteAndCapture(ExecutionLogEntry entry)
        {
            var service = new RecordingOrganizationService();
            new ExecutionLogWriter(service, new NullTracingService()).Write(entry);
            return service.Created[0];
        }

        [Fact]
        public void Write_StoresStartedOnAsDateTime_NotAString()
        {
            // The SDK rejects a string here with "Incorrect attribute value type", and because the
            // writer used to swallow that, runs went unlogged in silence.
            var record = WriteAndCapture(Entry());

            Assert.IsType<DateTime>(record["qdb_startedon"]);
        }

        [Fact]
        public void Write_StoresCountsAsIntegers()
        {
            var record = WriteAndCapture(Entry());

            Assert.IsType<int>(record["qdb_durationms"]);
            Assert.IsType<int>(record["qdb_rowcount"]);
        }

        [Fact]
        public void Write_BindsTheReportAsALookup()
        {
            var record = WriteAndCapture(Entry());

            var reference = Assert.IsType<EntityReference>(record["qdb_reportdefinitionid"]);
            Assert.Equal("qdb_reportdefinition", reference.LogicalName);
            Assert.Equal(ReportId, reference.Id);
        }

        [Fact]
        public void Write_RecordsTheActingUserAndOutcome()
        {
            var record = WriteAndCapture(Entry());

            var summary = (string)record["qdb_resultsummary"];
            Assert.Contains(UserId.ToString(), summary);
            Assert.Contains("success", summary);
        }

        [Fact]
        public void Write_TruncatesAnOverlongName()
        {
            var entry = Entry();
            entry.ReportName = new string('x', 400);

            var record = WriteAndCapture(entry);

            Assert.True(((string)record["qdb_name"]).Length <= 100);
        }

        [Fact]
        public void Write_WhenTheRecordCannotBeCreated_Throws()
        {
            // Fail closed: an unrecorded run must not quietly return data.
            var service = new RecordingOrganizationService { FailOnCreate = true };
            var writer = new ExecutionLogWriter(service, new NullTracingService());

            Assert.Throws<InvalidPluginExecutionException>(() => writer.Write(Entry()));
        }

        private sealed class NullTracingService : ITracingService
        {
            public void Trace(string format, params object[] args) { }
        }

        private sealed class RecordingOrganizationService : IOrganizationService
        {
            public List<Entity> Created { get; } = new List<Entity>();

            public bool FailOnCreate { get; set; }

            public Guid Create(Entity entity)
            {
                if (FailOnCreate) throw new InvalidOperationException("Incorrect attribute value type System.String");
                Created.Add(entity);
                return Guid.NewGuid();
            }

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();

            public void Update(Entity entity) => throw new NotSupportedException();

            public void Delete(string entityName, Guid id) => throw new NotSupportedException();

            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();

            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
                throw new NotSupportedException();

            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) =>
                throw new NotSupportedException();

            public EntityCollection RetrieveMultiple(QueryBase query) => throw new NotSupportedException();
        }
    }
}
