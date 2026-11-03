using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// A report that reads via a CRM View names the view it wants, and the engine has to find that
    /// exact view. These cover the ways it can find the wrong one, or none at all.
    /// </summary>
    public sealed class SavedViewResolutionTests
    {
        private const string AccountFetch = "<fetch><entity name='account' /></fetch>";
        private const string ContactFetch = "<fetch><entity name='contact' /></fetch>";

        [Fact]
        public void ResolveViewFetchXml_ReturnsTheViewOnTheReportsOwnTable()
        {
            var service = ViewStore(
                View("savedquery", "My Connections", "contact", ContactFetch),
                View("savedquery", "My Connections", "account", AccountFetch));

            var fetchXml = new SdkReportEngine(service).ResolveViewFetchXml("My Connections", "account");

            Assert.Equal(AccountFetch, fetchXml);
        }

        [Fact]
        public void ResolveViewFetchXml_PrefersASystemViewOverAPersonalOneOfTheSameName()
        {
            var service = ViewStore(
                View("userquery", "Active Accounts", "account", "<fetch>personal</fetch>"),
                View("savedquery", "Active Accounts", "account", AccountFetch));

            Assert.Equal(AccountFetch, new SdkReportEngine(service).ResolveViewFetchXml("Active Accounts", "account"));
        }

        [Fact]
        public void ResolveViewFetchXml_FallsBackToAPersonalViewWhenNoSystemViewMatches()
        {
            var service = ViewStore(View("userquery", "My Overdue", "account", AccountFetch));

            Assert.Equal(AccountFetch, new SdkReportEngine(service).ResolveViewFetchXml("My Overdue", "account"));
        }

        [Fact]
        public void ResolveViewFetchXml_WhenOnlyAnotherTablesViewMatches_Throws()
        {
            // Silently running the contact view would return a report of the wrong records, which
            // reads as data rather than as a failure.
            var service = ViewStore(View("savedquery", "My Connections", "contact", ContactFetch));

            var error = Assert.Throws<InvalidPluginExecutionException>(
                () => new SdkReportEngine(service).ResolveViewFetchXml("My Connections", "account"));

            Assert.Contains("account", error.Message);
        }

        [Fact]
        public void ResolveViewFetchXml_WhenNoViewIsVisible_NamesTheViewItLookedFor()
        {
            var error = Assert.Throws<InvalidPluginExecutionException>(
                () => new SdkReportEngine(ViewStore()).ResolveViewFetchXml("Retired view", "account"));

            Assert.Contains("Retired view", error.Message);
        }

        private static Entity View(string viewEntity, string name, string returnedTypeCode, string fetchXml)
        {
            var view = new Entity(viewEntity, Guid.NewGuid());
            view["name"] = name;
            view["returnedtypecode"] = returnedTypeCode;
            view["fetchxml"] = fetchXml;
            return view;
        }

        private static SavedViewService ViewStore(params Entity[] views) => new SavedViewService(views);

        /// <summary>
        /// Answers a QueryExpression the way the platform would: only rows of the queried table whose
        /// attributes satisfy every equality condition. Anything else throws, so a query that stops
        /// filtering shows up as a wrong result rather than as a stub that shrugs.
        /// </summary>
        private sealed class SavedViewService : IOrganizationService
        {
            private readonly IReadOnlyList<Entity> _views;

            public SavedViewService(IReadOnlyList<Entity> views) => _views = views;

            public EntityCollection RetrieveMultiple(QueryBase queryBase)
            {
                var query = (QueryExpression)queryBase;
                var matches = _views
                    .Where(view => view.LogicalName == query.EntityName)
                    .Where(view => query.Criteria.Conditions.All(condition => Matches(view, condition)))
                    .Take(query.TopCount ?? int.MaxValue);

                return new EntityCollection(matches.ToList());
            }

            private static bool Matches(Entity view, ConditionExpression condition) =>
                condition.Operator == ConditionOperator.Equal
                && Equals(view.GetAttributeValue<string>(condition.AttributeName), condition.Values.FirstOrDefault());

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
