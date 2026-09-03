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
        public void Standalone_SkipsADisabledDataset()
        {
            // MDS-FR-007: kept, but not executed — so an author can isolate a slow or broken source
            // without losing how it was configured.
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Overdue", DatasetComposition.Standalone, "task") with { IsEnabled = false });

            Assert.Empty(ReportSourcePlan.Standalone(definition));
        }

        [Fact]
        public void Standalone_RunsADatasetStoredBeforeTheFlagExisted()
        {
            // The column is absent on every row saved before this feature. Reading that as "disabled"
            // would switch off every dataset in the organisation on the day it shipped.
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Overdue", DatasetComposition.Standalone, "task"));

            Assert.Single(ReportSourcePlan.Standalone(definition));
        }

        [Fact]
        public void Execute_AppliesTheBlocksOwnRowLimit()
        {
            // MDS-FR-008: a child list usually wants a different bound from the report it hangs off.
            var store = new FetchStore();
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Overdue", DatasetComposition.Standalone, "task") with { RowLimit = 25 });

            new SdkReportEngine(store).Execute(definition with { RowLimit = 500 }, new ReportExecutionRequest());

            Assert.Contains(store.Queried, fetch => fetch.Contains("name=\"task\"") && fetch.Contains("top=\"25\""));
            Assert.Contains(store.Queried, fetch => fetch.Contains("name=\"account\"") && fetch.Contains("top=\"500\""));
        }

        [Fact]
        public void Execute_FallsBackToTheReportsRowLimitWhenTheBlockHasNone()
        {
            var store = new FetchStore();
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true),
                Source("Overdue", DatasetComposition.Standalone, "task"));

            new SdkReportEngine(store).Execute(definition with { RowLimit = 500 }, new ReportExecutionRequest());

            Assert.Contains(store.Queried, fetch => fetch.Contains("name=\"task\"") && fetch.Contains("top=\"500\""));
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
        /// The master-detail shape the requirement is actually about: one Termsheet, with its
        /// Requested Facilities and its Termsheet Conditions as separate blocks, each filtered to
        /// that termsheet.
        /// </summary>
        private static ReportDefinition Termsheet(string joinFromKey = "qdb_termsheetid", string joinToKey = "qdb_termsheetid")
        {
            var facilities = Source("Requested Facilities", DatasetComposition.Standalone, "qdb_requestedfacility", order: 1);
            return Report(
                // The root must PROJECT the key the block scopes by — a column the report does not
                // return cannot identify the parent, which is what the failure tests below cover.
                RootProjecting("qdb_termsheet", "qdb_termsheetid"),
                facilities with { JoinFromKey = joinFromKey, JoinToKey = joinToKey });
        }

        private static ReportDataSource RootProjecting(string entity, string keyColumn) => new ReportDataSource
        {
            Id = Guid.NewGuid(),
            Name = "Termsheet",
            IsPrimary = true,
            Composition = DatasetComposition.Joined,
            EntityMappings =
            [
                new ReportEntityMapping
                {
                    Id = Guid.NewGuid(),
                    EntityLogicalName = entity,
                    Columns =
                    [
                        new ReportColumn { Id = Guid.NewGuid(), ColumnLogicalName = "name", SortOrder = 1, IsVisible = true },
                        new ReportColumn { Id = Guid.NewGuid(), ColumnLogicalName = keyColumn, SortOrder = 2, IsVisible = true }
                    ]
                }
            ]
        };

        [Fact]
        public void Execute_FiltersAChildBlockToTheParentRow()
        {
            // Without this the block returns every facility in the system, which looks like data and
            // is the wrong data.
            var store = new FetchStore(rowValues: new Dictionary<string, object> { ["qdb_termsheetid"] = "TS-184" });

            new SdkReportEngine(store).Execute(Termsheet(), new ReportExecutionRequest());

            var childQuery = store.Queried[1];
            Assert.Contains("qdb_requestedfacility", childQuery);
            Assert.Contains("TS-184", childQuery);
        }

        [Fact]
        public void Execute_RunsABlockWithNoJoinKeyUnscoped()
        {
            // An independent block is a legitimate configuration, not an omission.
            var store = new FetchStore();
            var definition = Report(
                Source("Termsheet", DatasetComposition.Joined, "qdb_termsheet", isPrimary: true),
                Source("Reference data", DatasetComposition.Standalone, "qdb_lookup"));

            var result = new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            Assert.Equal(DatasetStatus.Ok, Assert.Single(result.StandaloneDatasets).Status);
        }

        [Fact]
        public void Execute_SaysSoWhenTheRootDoesNotCarryTheParentKey()
        {
            // Silently returning the whole child table is the failure being designed out, so the block
            // fails with a reason the author can act on.
            var store = new FetchStore(rowValues: new Dictionary<string, object> { ["something_else"] = "x" });

            var result = new SdkReportEngine(store).Execute(
                Termsheet(joinToKey: "qdb_missing"), new ReportExecutionRequest());

            var dataset = Assert.Single(result.StandaloneDatasets);
            Assert.Equal(DatasetStatus.Failed, dataset.Status);
            Assert.Contains("qdb_missing", dataset.Error);
        }

        [Fact]
        public void Execute_SaysSoWhenAScopedBlockNamesNoParentColumn()
        {
            var store = new FetchStore(rowValues: new Dictionary<string, object> { ["qdb_termsheetid"] = "TS-184" });

            var result = new SdkReportEngine(store).Execute(
                Termsheet(joinToKey: null), new ReportExecutionRequest());

            var dataset = Assert.Single(result.StandaloneDatasets);
            Assert.Equal(DatasetStatus.Failed, dataset.Status);
            Assert.Contains("identifies the parent", dataset.Error);
        }

        /// <summary>
        /// MDS-FR-001 — each dataset carries its own source type and query. The engine's block path
        /// re-enters Execute with the block as the only source, so the same override that honours the
        /// root's authored query has to honour the block's. These pin that: nothing else proves it,
        /// and the designer's save message has told authors to "make it Standalone" for weeks.
        /// </summary>
        [Fact]
        public void Execute_RunsABlocksOwnFetchXml()
        {
            var authored = "<fetch><entity name=\"qdb_requestedfacility\"><attribute name=\"name\"/>"
                + "<filter><condition attribute=\"statecode\" operator=\"eq\" value=\"0\"/></filter></entity></fetch>";
            var block = Source("Requested Facilities", DatasetComposition.Standalone, "qdb_requestedfacility", order: 1)
                with
            { SourceType = new CodedValue(null, "FetchXML"), QueryPayload = authored };
            var store = new FetchStore();

            new SdkReportEngine(store).Execute(
                Report(Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true), block),
                new ReportExecutionRequest());

            // The authored filter is the marker: a generated query would not carry it.
            Assert.Contains("statecode", store.Queried[1]);
        }

        [Fact]
        public void Execute_ScopesABlocksOwnQueryToTheParent()
        {
            // The authored query and the parent scope must BOTH survive — dropping either is silent
            // wrong data. The scope arrives through the filter-merge that already serves the root's
            // saved-view path.
            var authored = "<fetch><entity name=\"qdb_requestedfacility\"><attribute name=\"name\"/>"
                + "<filter><condition attribute=\"statecode\" operator=\"eq\" value=\"0\"/></filter></entity></fetch>";
            var definition = Termsheet();
            var block = (ReportDataSource)definition.DataSources[1]
                with
            { SourceType = new CodedValue(null, "FetchXML"), QueryPayload = authored };
            var store = new FetchStore(rowValues: new Dictionary<string, object> { ["qdb_termsheetid"] = "TS-184" });

            new SdkReportEngine(store).Execute(
                Report(definition.DataSources[0], block), new ReportExecutionRequest());

            var childQuery = store.Queried[1];
            Assert.Contains("statecode", childQuery);
            Assert.Contains("TS-184", childQuery);
        }

        [Fact]
        public void Execute_ResolvesABlocksViewAgainstItsOwnTable()
        {
            // View names repeat across tables, so the lookup must be scoped to the BLOCK's entity —
            // scoping it to the report's would find another table's view or nothing at all.
            var block = Source("Requested Facilities", DatasetComposition.Standalone, "qdb_requestedfacility", order: 1)
                with
            { SourceType = new CodedValue(null, "CRM View"), QueryPayload = "Open Facilities" };
            var store = new FetchStore(viewFetchXml:
                "<fetch><entity name=\"qdb_requestedfacility\"><attribute name=\"name\"/>"
                + "<filter><condition attribute=\"qdb_isopen\" operator=\"eq\" value=\"1\"/></filter></entity></fetch>");

            new SdkReportEngine(store).Execute(
                Report(Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true), block),
                new ReportExecutionRequest());

            Assert.Equal("qdb_requestedfacility", store.ViewLookupEntity);
            Assert.Contains("qdb_isopen", store.Queried[1]);
        }

        /// <summary>
        /// D2 — @Parameter tokens in an authored query (the SSRS @LoanId pattern). The supplied
        /// prompt value wins, then the parameter's default; an unknown or unfilled token fails the
        /// dataset BY NAME, because FetchXML would otherwise match the literal "@LoanId" against
        /// every row and return an empty result indistinguishable from a legitimate one.
        /// </summary>
        private static ReportDataSource TokenBlock(string value = "@LoanId") =>
            Source("Facilities for the loan", DatasetComposition.Standalone, "qdb_requestedfacility", order: 1)
                with
            {
                SourceType = new CodedValue(null, "FetchXML"),
                QueryPayload = "<fetch><entity name=\"qdb_requestedfacility\"><attribute name=\"name\"/>"
                    + $"<filter><condition attribute=\"qdb_loanid\" operator=\"eq\" value=\"{value}\"/></filter></entity></fetch>"
            };

        private static ReportDefinition TokenReport(string defaultValue = null, ReportDataSource block = null) =>
            Report(Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true), block ?? TokenBlock())
                with
            {
                Parameters =
                [
                    new ReportParameter { Id = Guid.NewGuid(), ParameterName = "LoanId", DefaultValue = defaultValue }
                ]
            };

        private static ReportExecutionRequest Supplying(string name, string value) => new ReportExecutionRequest
        {
            ParameterValues = new Dictionary<string, string?> { [name] = value }
        };

        [Fact]
        public void Execute_SubstitutesASuppliedParameterIntoABlocksOwnQuery()
        {
            var store = new FetchStore();

            new SdkReportEngine(store).Execute(TokenReport(), Supplying("LoanId", "LN-2041"));

            Assert.Contains("LN-2041", store.Queried[1]);
            Assert.DoesNotContain("@LoanId", store.Queried[1]);
        }

        [Fact]
        public void Execute_FallsBackToTheParameterDefaultWhenNoneIsSupplied()
        {
            var store = new FetchStore();

            new SdkReportEngine(store).Execute(TokenReport(defaultValue: "LN-DEFAULT"), new ReportExecutionRequest());

            Assert.Contains("LN-DEFAULT", store.Queried[1]);
        }

        [Fact]
        public void Execute_FailsTheBlockByNameWhenTheTokenNamesNoParameter()
        {
            var store = new FetchStore();
            var definition = Report(
                Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true), TokenBlock());

            var result = new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            var block = Assert.Single(result.StandaloneDatasets);
            Assert.Equal(DatasetStatus.Failed, block.Status);
            Assert.Contains("LoanId", block.Error);
            Assert.Single(store.Queried); // the root still ran; the block never queried on a bad token
        }

        [Fact]
        public void Execute_FailsTheBlockByNameWhenTheParameterHasNoValue()
        {
            var store = new FetchStore();

            var result = new SdkReportEngine(store).Execute(TokenReport(), new ReportExecutionRequest());

            var block = Assert.Single(result.StandaloneDatasets);
            Assert.Equal(DatasetStatus.Failed, block.Status);
            Assert.Contains("LoanId", block.Error);
        }

        [Fact]
        public void Execute_NeverTouchesALiteralThatMerelyContainsAnAt()
        {
            // An email address in a filter value is a literal, not a token.
            var store = new FetchStore();
            var definition = TokenReport(block: TokenBlock(value: "someone@qnb.com.qa"));

            new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            Assert.Contains("someone@qnb.com.qa", store.Queried[1]);
        }

        [Fact]
        public void Execute_SubstitutesIntoTheRootsAuthoredQueryToo()
        {
            var store = new FetchStore();
            var root = Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true)
                with
            {
                SourceType = new CodedValue(null, "FetchXML"),
                QueryPayload = "<fetch><entity name=\"account\"><attribute name=\"name\"/>"
                    + "<filter><condition attribute=\"accountid\" operator=\"eq\" value=\"@LoanId\"/></filter></entity></fetch>"
            };
            var definition = Report(root) with
            {
                Parameters = [new ReportParameter { Id = Guid.NewGuid(), ParameterName = "LoanId", DefaultValue = null }]
            };

            new SdkReportEngine(store).Execute(definition, Supplying("LoanId", "LN-7"));

            Assert.Contains("LN-7", store.Queried[0]);
            Assert.DoesNotContain("@LoanId", store.Queried[0]);
        }

        /// <summary>
        /// D2 — a filter bound to a dataset belongs to THAT dataset's query. Unbound filters stay
        /// the root's; a bound one names the block table's own attributes, which is exactly why the
        /// engine used to have to drop every filter for a block.
        /// </summary>
        private static ReportFilter BoundFilter(Guid? dataSourceId, string alias = "qdb_facilitytype",
            string value = "Term loan", bool prompt = false) => new ReportFilter
        {
            Id = Guid.NewGuid(),
            FieldAlias = alias,
            Operator = new CodedValue(null, "Equals"),
            Value = value,
            Sequence = 1,
            IsRuntimePrompt = prompt,
            DataSourceId = dataSourceId
        };

        [Fact]
        public void Execute_KeepsADatasetBoundFilterOutOfTheRootQuery()
        {
            var block = Source("Facilities", DatasetComposition.Standalone, "qdb_requestedfacility", order: 1);
            var definition = Report(Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true), block)
                with
            { Filters = [BoundFilter(block.Id)] };
            var store = new FetchStore();

            new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            Assert.DoesNotContain("qdb_facilitytype", store.Queried[0]);
            Assert.Contains("qdb_facilitytype", store.Queried[1]);
            Assert.Contains("Term loan", store.Queried[1]);
        }

        [Fact]
        public void Execute_AppliesTheBoundFilterOnTopOfTheParentScope()
        {
            // Both must survive: the scope decides WHOSE children, the filter decides WHICH of them.
            var definition = Termsheet();
            var block = (ReportDataSource)definition.DataSources[1];
            definition = definition with { Filters = [BoundFilter(block.Id)] };
            var store = new FetchStore(rowValues: new Dictionary<string, object> { ["qdb_termsheetid"] = "TS-184" });

            new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            Assert.Contains("TS-184", store.Queried[1]);
            Assert.Contains("Term loan", store.Queried[1]);
        }

        [Fact]
        public void Execute_ResolvesABlocksRuntimePromptFromTheSuppliedParameter()
        {
            var block = Source("Facilities", DatasetComposition.Standalone, "qdb_requestedfacility", order: 1);
            var definition = Report(Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true), block)
                with
            {
                Filters = [BoundFilter(block.Id, value: "FacilityType", prompt: true)],
                Parameters = [new ReportParameter { Id = Guid.NewGuid(), ParameterName = "FacilityType" }]
            };
            var store = new FetchStore();

            new SdkReportEngine(store).Execute(definition, Supplying("FacilityType", "Overdraft"));

            Assert.Contains("Overdraft", store.Queried[1]);
        }

        [Fact]
        public void Execute_AppliesAFilterBoundToThePrimaryToTheRoot()
        {
            var primary = Source("Accounts", DatasetComposition.Joined, "account", isPrimary: true);
            var definition = Report(primary) with { Filters = [BoundFilter(primary.Id, alias: "statecode", value: "0")] };
            var store = new FetchStore();

            new SdkReportEngine(store).Execute(definition, new ReportExecutionRequest());

            Assert.Contains("statecode", store.Queried[0]);
        }

        /// <summary>
        /// Answers any FetchXML with a single row, recording what it was asked. It refuses the
        /// entity named in <c>failOn</c>, so a block can be made to fail the way a real misconfigured
        /// query does — by the platform rejecting it, not by the test throwing on its own.
        /// </summary>
        private sealed class FetchStore : IOrganizationService
        {
            private readonly string _failOn;
            private readonly IDictionary<string, object> _rowValues;
            private readonly string _viewFetchXml;

            public FetchStore(string failOn = null, IDictionary<string, object> rowValues = null, string viewFetchXml = null)
            {
                _failOn = failOn;
                _rowValues = rowValues;
                _viewFetchXml = viewFetchXml;
            }

            public List<string> Queried { get; } = new List<string>();

            /// <summary>The entity the saved-view lookup was scoped to, so a test can prove it was the block's.</summary>
            public string ViewLookupEntity { get; private set; }

            public EntityCollection RetrieveMultiple(QueryBase queryBase)
            {
                // The saved-view lookup arrives as a QueryExpression over savedquery/userquery, not as
                // FetchXML — answering it here is what lets a CRM View block resolve inside a test.
                if (queryBase is QueryExpression viewLookup)
                {
                    foreach (var condition in viewLookup.Criteria.Conditions)
                    {
                        if (condition.AttributeName == "returnedtypecode")
                        {
                            ViewLookupEntity = Convert.ToString(condition.Values[0]);
                        }
                    }

                    if (_viewFetchXml == null) return new EntityCollection();
                    var view = new Entity(viewLookup.EntityName);
                    view["fetchxml"] = _viewFetchXml;
                    return new EntityCollection(new List<Entity> { view });
                }

                var fetchXml = ((FetchExpression)queryBase).Query;
                Queried.Add(fetchXml);

                if (_failOn != null && fetchXml.Contains("name=\"" + _failOn + "\""))
                {
                    throw new InvalidOperationException("The platform refused the query.");
                }

                var row = new Entity("row");
                row["name"] = "Acme";
                if (_rowValues != null)
                {
                    foreach (var pair in _rowValues) row[pair.Key] = pair.Value;
                }

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
