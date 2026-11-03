using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.ReportEngine.CrmPlugin;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// The configuration trail answers "who changed this report, and to what". These cover the ways
    /// it can quietly stop answering that: a publish recorded as an ordinary edit, a diff that shows
    /// every attribute instead of the ones that moved, a delete that cannot be written at all.
    /// </summary>
    public sealed class ReportConfigurationAuditTests
    {
        private static readonly Guid ReportId = Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");
        private static readonly Guid UserId = Guid.Parse("bbbbbbbb-2222-2222-2222-222222222222");

        [Fact]
        public void Create_RecordsTheNewDefinition()
        {
            var target = new Entity("qdb_reportdefinition", ReportId);
            target["qdb_name"] = "Quarterly exposure";

            var change = ReportConfigurationAuditPlugin.Describe(Context("Create", target));

            Assert.Equal(AuditAction.Create, change.Action);
            Assert.Equal(ReportId, change.ReportId);
            Assert.Contains("Quarterly exposure", change.After);
            Assert.Null(change.Before);
        }

        [Fact]
        public void Create_LinksTheRow_EvenWhenTheTargetCarriesNoId()
        {
            // The platform assigns the id, so a created target often has none. Without a fallback the
            // row goes in unlinked and the trail cannot say which report was created.
            var target = new Entity("qdb_reportdefinition");
            target["qdb_name"] = "New report";
            var context = Context("Create", target);
            context.PrimaryEntityId = ReportId;

            Assert.Equal(ReportId, ReportConfigurationAuditPlugin.Describe(context).ReportId);
        }

        [Fact]
        public void Diff_LeavesOutTheRecordsOwnId()
        {
            // The target carries the primary key on every write; showing it in a diff reads as though
            // the key itself had moved.
            var target = new Entity("qdb_reportdefinition", ReportId);
            target["qdb_rowlimit"] = 10;
            target["qdb_reportdefinitionid"] = ReportId;

            var change = ReportConfigurationAuditPlugin.Describe(Context("Update", target));

            Assert.DoesNotContain("qdb_reportdefinitionid", change.After);
            Assert.Contains("qdb_rowlimit", change.After);
        }

        [Fact]
        public void Update_RecordsOnlyTheAttributesThatChanged()
        {
            // A report has dozens of attributes. A diff listing all of them hides the one that moved.
            var target = new Entity("qdb_reportdefinition", ReportId);
            target["qdb_rowlimit"] = 100;
            var before = new Entity("qdb_reportdefinition", ReportId);
            before["qdb_rowlimit"] = 50000;
            before["qdb_name"] = "Untouched";

            var change = ReportConfigurationAuditPlugin.Describe(Context("Update", target, before));

            Assert.Contains("qdb_rowlimit", change.After);
            Assert.Contains("50000", change.Before);
            Assert.DoesNotContain("Untouched", change.Before);
        }

        [Fact]
        public void Update_ThatPublishes_IsRecordedAsAPublish()
        {
            // The option set has a value for it, and burying a publish inside "Update" hides the one
            // change an approver looks for.
            var change = ReportConfigurationAuditPlugin.Describe(PublishContext(nowPublished: true, wasPublished: false));

            Assert.Equal(AuditAction.Publish, change.Action);
        }

        [Fact]
        public void Update_ThatUnpublishes_IsRecordedAsAnUnpublish()
        {
            var change = ReportConfigurationAuditPlugin.Describe(PublishContext(nowPublished: false, wasPublished: true));

            Assert.Equal(AuditAction.Unpublish, change.Action);
        }

        [Fact]
        public void Update_ThatRewritesTheSamePublishState_StaysAnUpdate()
        {
            var change = ReportConfigurationAuditPlugin.Describe(PublishContext(nowPublished: true, wasPublished: true));

            Assert.Equal(AuditAction.Update, change.Action);
        }

        [Fact]
        public void Update_TouchingOnlyPlatformStamps_RecordsNothing()
        {
            // Every write stamps modifiedon. A row for that would bury real changes in bookkeeping.
            var target = new Entity("qdb_reportdefinition", ReportId);
            target["modifiedon"] = DateTime.UtcNow;

            Assert.Null(ReportConfigurationAuditPlugin.Describe(Context("Update", target)));
        }

        [Fact]
        public void Delete_RecordsWhatWasRemoved()
        {
            var before = new Entity("qdb_reportdefinition", ReportId);
            before["qdb_name"] = "Retired report";
            var context = new FakeContext
            {
                MessageName = "Delete",
                PrimaryEntityName = "qdb_reportdefinition",
                InitiatingUserId = UserId
            };
            context.InputParameters["Target"] = new EntityReference("qdb_reportdefinition", ReportId);
            context.PreEntityImages["PreImage"] = before;

            var change = ReportConfigurationAuditPlugin.Describe(context);

            Assert.Equal(AuditAction.Delete, change.Action);
            Assert.Contains("Retired report", change.Before);
            Assert.Equal(ReportId, change.DeletedReportId);
        }

        [Fact]
        public void Delete_DoesNotLinkToTheReportItRemoved()
        {
            // The row is gone, and Dataverse rejects a lookup to a missing record — which would mean
            // the one change that destroys a definition is the one that leaves no trail.
            var change = ReportConfigurationAuditPlugin.Describe(DeleteContext());
            var record = WriteAndCapture(change);

            Assert.False(record.Contains("qdb_reportdefinitionid"));
            Assert.Contains(ReportId.ToString(), (string)record["qdb_comment"]);
        }

        [Fact]
        public void Write_RecordsTheReportIdOnEveryRow_NotJustTheLookup()
        {
            // The lookup's cascade is RemoveLink: deleting a report clears the reference on all of
            // its history, so the rows survive but stop saying what they were about.
            var target = new Entity("qdb_reportdefinition", ReportId);
            target["qdb_rowlimit"] = 10;

            var record = WriteAndCapture(ReportConfigurationAuditPlugin.Describe(Context("Update", target)));

            Assert.Contains(ReportId.ToString(), (string)record["qdb_comment"]);
        }

        [Fact]
        public void Write_OwnsTheRowByTheUserWhoMadeTheChange()
        {
            // The row is created as SYSTEM so it cannot be suppressed; ownership is what names the
            // person, and it is what the Audit Log view reads for "Changed by".
            var record = WriteAndCapture(ReportConfigurationAuditPlugin.Describe(DeleteContext()));

            var owner = Assert.IsType<EntityReference>(record["ownerid"]);
            Assert.Equal("systemuser", owner.LogicalName);
            Assert.Equal(UserId, owner.Id);
        }

        [Fact]
        public void Write_StoresTheActionAsAnOptionSetValue()
        {
            var record = WriteAndCapture(ReportConfigurationAuditPlugin.Describe(DeleteContext()));

            Assert.Equal(AuditAction.Delete, Assert.IsType<OptionSetValue>(record["qdb_actiontype"]).Value);
            Assert.IsType<DateTime>(record["qdb_changedon"]);
        }

        [Fact]
        public void Write_WhenTheRecordCannotBeCreated_Throws()
        {
            // Fail closed: a change that cannot be recorded is rolled back rather than applied
            // unrecorded, exactly as an unlogged execution withholds its rows.
            var service = new RecordingOrganizationService { FailOnCreate = true };

            Assert.Throws<InvalidPluginExecutionException>(
                () => new ReportAuditWriter(service, new NullTracingService())
                    .Write(ReportConfigurationAuditPlugin.Describe(DeleteContext())));
        }

        [Fact]
        public void AuditJson_UnwrapsSdkTypesIntoWhatAReaderRecognises()
        {
            var values = new List<KeyValuePair<string, object>>
            {
                new KeyValuePair<string, object>("choice", new OptionSetValue(100000001)),
                new KeyValuePair<string, object>("amount", new Money(1500.5m)),
                new KeyValuePair<string, object>("lookup", new EntityReference("account", Guid.NewGuid()) { Name = "QNB" }),
                new KeyValuePair<string, object>("flag", true),
                new KeyValuePair<string, object>("empty", null)
            };

            var json = AuditJson.Write(values);

            Assert.Contains("\"choice\":100000001", json);
            Assert.Contains("\"amount\":1500.5", json);
            Assert.Contains("\"lookup\":\"QNB\"", json);
            Assert.Contains("\"flag\":true", json);
            Assert.Contains("\"empty\":null", json);
        }

        private static Entity WriteAndCapture(ReportChange change)
        {
            var service = new RecordingOrganizationService();
            new ReportAuditWriter(service, new NullTracingService()).Write(change);
            return service.Created[0];
        }

        private static FakeContext DeleteContext()
        {
            var before = new Entity("qdb_reportdefinition", ReportId);
            before["qdb_name"] = "Retired report";
            var context = new FakeContext
            {
                MessageName = "Delete",
                PrimaryEntityName = "qdb_reportdefinition",
                InitiatingUserId = UserId
            };
            context.InputParameters["Target"] = new EntityReference("qdb_reportdefinition", ReportId);
            context.PreEntityImages["PreImage"] = before;
            return context;
        }

        private static FakeContext PublishContext(bool nowPublished, bool wasPublished)
        {
            var target = new Entity("qdb_reportdefinition", ReportId);
            target["qdb_ispublished"] = nowPublished;
            var before = new Entity("qdb_reportdefinition", ReportId);
            before["qdb_ispublished"] = wasPublished;
            return Context("Update", target, before);
        }

        private static FakeContext Context(string message, Entity target, Entity before = null)
        {
            var context = new FakeContext
            {
                MessageName = message,
                PrimaryEntityName = "qdb_reportdefinition",
                InitiatingUserId = UserId
            };
            context.InputParameters["Target"] = target;
            if (before != null) context.PreEntityImages["PreImage"] = before;
            return context;
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
                if (FailOnCreate) throw new InvalidOperationException("audit table unavailable");
                Created.Add(entity);
                return Guid.NewGuid();
            }

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();

            public void Update(Entity entity) => throw new NotSupportedException();

            public void Delete(string entityName, Guid id) => throw new NotSupportedException();

            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();

            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection related) =>
                throw new NotSupportedException();

            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection related) =>
                throw new NotSupportedException();

            public EntityCollection RetrieveMultiple(QueryBase query) => throw new NotSupportedException();
        }
    }
}
