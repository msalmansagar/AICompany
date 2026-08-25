using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Qdb.ReportEngine.Core.Models;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// ADD-002 Phase A: a report may declare datasets that render as their own blocks rather than
    /// joining the root (MDS-FR-004).
    ///
    /// The failure this guards against is silence. Before this feature the engine read only the
    /// primary source and dropped every other one without a word, so an author configured a second
    /// dataset and got a report that looked finished.
    /// </summary>
    public sealed class StandaloneDatasetTests
    {
        private static ReportDataSource Source(
            string name, string composition, string entity, bool isPrimary = false, int order = 0) =>
            new ReportDataSource
            {
                Id = Guid.NewGuid(),
                Name = name,
                IsPrimary = isPrimary,
                ExecutionOrder = order,
                Composition = composition,
                EntityMappings =
                [
                    new ReportEntityMapping
                    {
                        Id = Guid.NewGuid(),
                        EntityLogicalName = entity,
                        Columns =
                        [
                            new ReportColumn { Id = Guid.NewGuid(), ColumnLogicalName = "name", SortOrder = 1, IsVisible = true }
                        ]
                    }
                ]
            };

        private static ReportDefinition Report(params ReportDataSource[] sources) => new ReportDefinition
        {
            Id = Guid.NewGuid(),
            Name = "Portfolio review",
            MainEntityLogicalName = "account",
            DataSources = sources
        };

        [Fact]
        public void Standalone_ExcludesTheJoinedSources()
        {
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Contacts", DatasetComposition.Joined, "contact"));

            Assert.Empty(ReportSourcePlan.Standalone(definition));
        }

        [Fact]
        public void Standalone_TreatsASourceWithNoCompositionAsJoined()
        {
            // Every source stored before MDS-FR-002 has no composition. They must keep behaving as
            // they always did rather than becoming blocks the author never asked for.
            var definition = Report(
                new ReportDataSource { Id = Guid.NewGuid(), IsPrimary = true },
                new ReportDataSource { Id = Guid.NewGuid() });

            Assert.Empty(ReportSourcePlan.Standalone(definition));
        }

        [Fact]
        public void Standalone_NeverTreatsThePrimarySourceAsABlock()
        {
            // The primary source is the root. A report whose root rendered as a detached block would
            // have no main result at all.
            var definition = Report(Source("Accounts", DatasetComposition.Standalone, "account", isPrimary: true));

            Assert.Empty(ReportSourcePlan.Standalone(definition));
        }

        [Fact]
        public void Standalone_ReturnsBlocksInExecutionOrder()
        {
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Second", DatasetComposition.Standalone, "contact", order: 2),
                Source("First", DatasetComposition.Standalone, "task", order: 1));

            var standalone = ReportSourcePlan.Standalone(definition);

            Assert.Equal(["First", "Second"], standalone.Select(source => source.Name));
        }

        [Fact]
        public void Execute_ReturnsAStandaloneSourceAsItsOwnDataset()
        {
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Overdue", DatasetComposition.Standalone, "task"));

            var result = new SdkReportEngine(new FetchStore()).Execute(definition, new ReportExecutionRequest());

            var dataset = Assert.Single(result.StandaloneDatasets);
            Assert.Equal("Overdue", dataset.Name);
            Assert.Equal(DatasetRole.Standalone, dataset.Role);
            Assert.Equal(DatasetStatus.Ok, dataset.Status);
        }

        [Fact]
        public void Execute_QueriesTheStandaloneSourcesOwnEntity()
        {
            // The block's entity is its own, not the report's main entity. Querying the root's table
            // twice would return the same rows under a second heading.
            var store = new FetchStore();
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Overdue", DatasetComposition.Standalone, "task"));

            new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            Assert.Contains(store.Queried, fetch => fetch.Contains("name=\"task\""));
        }

        [Fact]
        public void Execute_KeepsAStandaloneSourceOutOfTheRootQuery()
        {
            var store = new FetchStore();
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Overdue", DatasetComposition.Standalone, "task"));

            new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            var rootQuery = store.Queried[0];
            Assert.Contains("name=\"account\"", rootQuery);
            Assert.DoesNotContain("task", rootQuery);
        }

        [Fact]
        public void Execute_ReportsAFailedBlockRatherThanEndingTheReport()
        {
            // MDS-FR-016 / MDS-FR-028. One misconfigured block must not cost the author every other
            // dataset, and it must not arrive as an empty table either — that is indistinguishable
            // from a query which legitimately matched nothing.
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Broken", DatasetComposition.Standalone, "task"));

            var result = new SdkReportEngine(new FetchStore(failOn: "task")).Execute(definition, new ReportExecutionRequest());

            var dataset = Assert.Single(result.StandaloneDatasets);
            Assert.Equal(DatasetStatus.Failed, dataset.Status);
            Assert.Contains("refused", dataset.Error);
            Assert.Empty(dataset.Rows);
        }

        [Fact]
        public void Execute_StillReturnsTheRootWhenABlockFails()
        {
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Broken", DatasetComposition.Standalone, "task"));

            var result = new SdkReportEngine(new FetchStore(failOn: "task")).Execute(definition, new ReportExecutionRequest());

            Assert.Equal(1, result.RowCount);
        }

        [Fact]
        public void Execute_LeavesStandaloneDatasetsEmptyForAnOrdinaryReport()
        {
            // The compatibility guarantee at the engine level: a report with one source must produce
            // no dataset collection, so ReportResultJson keeps emitting the historical shape.
            var definition = Report(Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true));

            var result = new SdkReportEngine(new FetchStore()).Execute(definition, new ReportExecutionRequest());

            Assert.Empty(result.StandaloneDatasets);
        }

        /// <summary>
        /// Answers any FetchXML with a single row, recording what it was asked. It refuses the
        /// entity named in <c>failOn</c>, so a block can be made to fail the way a real misconfigured
        /// query does — by the platform rejecting it, not by the test throwing on its own.
        /// </summary>
        private sealed class FetchStore : IOrganizationService
        {
            private readonly string _failOn;

            public FetchStore(string failOn = null) => _failOn = failOn;

            public List<string> Queried { get; } = new List<string>();

            public EntityCollection RetrieveMultiple(QueryBase queryBase)
            {
                var fetchXml = ((FetchExpression)queryBase).Query;
                Queried.Add(fetchXml);

                if (_failOn != null && fetchXml.Contains("name=\"" + _failOn + "\""))
                {
                    throw new InvalidOperationException("The platform refused the query.");
                }

                var row = new Entity("row");
                row["name"] = "Acme";
                return new EntityCollection(new List<Entity> { row });
            }

            public Guid Create(Entity entity) => throw new NotSupportedException();

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => throw new NotSupportedException();

            public void Update(Entity entity) => throw new NotSupportedException();

            public void Delete(string entityName, Guid id) => throw new NotSupportedException();

            public OrganizationResponse Execute(OrganizationRequest request) => throw new NotSupportedException();

            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection related) =>
                throw new NotSupportedException();

            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection related) =>
                throw new NotSupportedException();
        }
    }
}
