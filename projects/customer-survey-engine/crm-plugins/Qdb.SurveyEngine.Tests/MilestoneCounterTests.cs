using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class MilestoneCounterFetchXmlTests
    {
        private static MilestoneCountQuery QueryWithNoTypeField() => new MilestoneCountQuery
        {
            Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields
            {
                CustomerLookup = "qdb_customer_name",
                Type = null, // no type field configured
            }),
            Settings = new MilestoneSettings
            {
                StatusValues = CodeList.Parse("100000005"),
                TypeValues = CodeList.Parse("751090000"), // type values set but no field to apply them to
            },
            CustomerId = new Guid("22222222-2222-2222-2222-222222222222"),
        };

        /// <summary>
        /// When the source has no type field, type values must be ignored even if set,
        /// because there is no column to filter on.
        /// </summary>
        [Fact]
        public void BuildFetchXml_TypeValuesSetButNoTypeField_OmitsTheTypeFilter()
        {
            var fetch = MilestoneCounter.BuildFetchXml(QueryWithNoTypeField());

            // The type IN condition must not appear, but the status IN must still appear
            Assert.DoesNotContain("<value>751090000</value>", fetch);
            Assert.Contains("<value>100000005</value>", fetch);
        }

        [Fact]
        public void BuildFetchXml_TypeValuesSetButWhitespaceTypeField_OmitsTheTypeFilter()
        {
            var fields = new SourceFields { CustomerLookup = "qdb_customer_name", Type = "   " };
            var query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", fields),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("100000005"), TypeValues = CodeList.Parse("751090000") },
                CustomerId = new Guid("22222222-2222-2222-2222-222222222222"),
            };

            var fetch = MilestoneCounter.BuildFetchXml(query);

            Assert.DoesNotContain("<value>751090000</value>", fetch);
        }

        [Fact]
        public void BuildFetchXml_NoCreatedBefore_OmitsUpperDateLimit()
        {
            var query = QueryWithNoTypeField();
            query.CreatedBefore = null;

            var fetch = MilestoneCounter.BuildFetchXml(query);

            Assert.DoesNotContain("operator='lt'", fetch);
        }

        [Fact]
        public void CountQualifying_AliasedValuePresent_ConvertsToInt()
        {
            var entity = new Entity("qdb_cheque_clearing") { ["qualifying"] = new AliasedValue("qdb_cheque_clearing", "qdb_cheque_clearingid", 7) };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { entity }));

            var query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields { CustomerLookup = "qdb_customer_name" }),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("100000005") },
                CustomerId = Guid.NewGuid(),
            };

            Assert.Equal(7, new MilestoneCounter(service.Object).CountQualifying(query));
        }

        [Fact]
        public void CountQualifying_EmptyResultSet_ReturnsZero()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection());

            var query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields { CustomerLookup = "qdb_customer_name" }),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("100000005") },
                CustomerId = Guid.NewGuid(),
            };

            Assert.Equal(0, new MilestoneCounter(service.Object).CountQualifying(query));
        }

        /// <summary>
        /// FetchXml.Escape is internal, but its output reaches BuildFetchXml's return value.
        /// A table or customer id containing an XML special character verifies the escaping path.
        /// </summary>
        [Fact]
        public void BuildFetchXml_XmlSpecialCharInCustomerId_IsXmlEscapedInOutput()
        {
            var query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields { CustomerLookup = "qdb_customer_name" }),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("val&ue") },
                CustomerId = Guid.NewGuid(),
            };

            var fetch = MilestoneCounter.BuildFetchXml(query);

            // The ampersand must be encoded, not left raw
            Assert.Contains("val&amp;ue", fetch);
            Assert.DoesNotContain("<value>val&ue</value>", fetch);
        }
    }
}
