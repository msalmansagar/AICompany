using System.Linq;
using System.Xml.Linq;
using Qdb.SurveyEngine.Domain;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class AudienceQueryTests
    {
        private const string DohaAccounts =
            "<fetch version='1.0' output-format='xml-platform' mapping='logical' top='10'>" +
            "<entity name='account'><attribute name='name' /><attribute name='accountid' /><order attribute='name' descending='false' />" +
            "<filter type='and'><condition attribute='address1_city' operator='eq' value='Doha' /></filter>" +
            "<link-entity name='qdb_payment_authorization_ticket' from='qdb_customer_name' to='accountid' link-type='inner' alias='t'>" +
            "<attribute name='qdb_name' /><filter type='and'><condition attribute='statecode' operator='eq' value='0' /></filter></link-entity>" +
            "</entity></fetch>";

        private static XElement Page(AudienceQuery query, string cookie = null) => XElement.Parse(query.ToPageFetchXml(2, 250, cookie));

        private static XElement Entity(XElement fetch) => fetch.Element("entity");

        [Fact]
        public void FromFetchXml_AdvancedFindFilter_KeepsTheFilterAndTheLinkEntity()
        {
            var entity = Entity(Page(AudienceQuery.FromFetchXml(DohaAccounts, "account")));

            Assert.Equal("Doha", (string)entity.Element("filter").Element("condition").Attribute("value"));
            Assert.Equal("qdb_payment_authorization_ticket", (string)entity.Element("link-entity").Attribute("name"));
        }

        [Fact]
        public void FromFetchXml_ColumnsAndOrder_AreReplacedByTheIdOnly()
        {
            var entity = Entity(Page(AudienceQuery.FromFetchXml(DohaAccounts, "account")));

            Assert.Equal(new[] { "accountid" }, entity.Elements("attribute").Select(a => (string)a.Attribute("name")));
            Assert.Equal("accountid", (string)entity.Element("order").Attribute("attribute"));
        }

        [Fact]
        public void FromFetchXml_ColumnsInsideLinkEntity_AreRemoved()
        {
            var link = Entity(Page(AudienceQuery.FromFetchXml(DohaAccounts, "account"))).Element("link-entity");

            Assert.Empty(link.Elements("attribute"));
        }

        [Fact]
        public void ToPageFetchXml_StoredTop_IsIgnoredAndPagingApplied()
        {
            var fetch = Page(AudienceQuery.FromFetchXml(DohaAccounts, "account"));

            Assert.Null(fetch.Attribute("top"));
            Assert.Equal("250", (string)fetch.Attribute("count"));
            Assert.Equal("2", (string)fetch.Attribute("page"));
            Assert.Equal("true", (string)fetch.Attribute("distinct"));
        }

        [Fact]
        public void ToPageFetchXml_PagingCookie_IsCarriedEscaped()
        {
            var cookie = "<cookie page=\"1\"><accountid last=\"{1}\" /></cookie>";

            Assert.Equal(cookie, (string)Page(AudienceQuery.FromFetchXml(DohaAccounts, "account"), cookie).Attribute("paging-cookie"));
        }

        [Fact]
        public void FromFetchXml_TableNameInAnotherCase_IsAccepted()
        {
            var query = AudienceQuery.FromFetchXml("<fetch><entity name='Contact'><filter><condition attribute='lastname' operator='not-null' /></filter></entity></fetch>", "contact");

            Assert.Equal("contactid", (string)Entity(Page(query)).Element("attribute").Attribute("name"));
        }

        [Fact]
        public void FromFetchXml_OtherTable_IsRefused()
        {
            var refusal = Assert.Throws<AudienceFilterException>(() => AudienceQuery.FromFetchXml("<fetch><entity name='incident' /></fetch>", "account"));

            Assert.Contains("'incident'", refusal.Message);
        }

        [Fact]
        public void FromFetchXml_Aggregate_IsRefused()
        {
            Assert.Throws<AudienceFilterException>(() => AudienceQuery.FromFetchXml("<fetch aggregate='true'><entity name='account' /></fetch>", "account"));
        }

        [Fact]
        public void FromFetchXml_Malformed_IsRefused()
        {
            Assert.Contains("not valid FetchXML", Assert.Throws<AudienceFilterException>(() => AudienceQuery.FromFetchXml("<fetch><entity", "account")).Message);
        }

        [Fact]
        public void FromFetchXml_Empty_IsRefused()
        {
            Assert.Contains("empty", Assert.Throws<AudienceFilterException>(() => AudienceQuery.FromFetchXml("  ", "account")).Message);
        }

        [Fact]
        public void FromFetchXml_NotFetchRoot_IsRefused()
        {
            Assert.Throws<AudienceFilterException>(() => AudienceQuery.FromFetchXml("<query><entity name='account' /></query>", "account"));
        }

        [Fact]
        public void FromFetchXml_TwoEntities_IsRefused()
        {
            Assert.Throws<AudienceFilterException>(() => AudienceQuery.FromFetchXml("<fetch><entity name='account' /><entity name='account' /></fetch>", "account"));
        }

        [Fact]
        public void FromFetchXml_NoConditions_MeansEveryCustomer()
        {
            var entity = Entity(Page(AudienceQuery.FromFetchXml("<fetch><entity name='account'><attribute name='name' /></entity></fetch>", "account")));

            Assert.Null(entity.Element("filter"));
        }

        [Fact]
        public void AllActive_FiltersOnStatecodeZero()
        {
            var condition = Entity(Page(AudienceQuery.AllActive("contact"))).Element("filter").Element("condition");

            Assert.Equal("statecode", (string)condition.Attribute("attribute"));
            Assert.Equal("0", (string)condition.Attribute("value"));
        }

        [Fact]
        public void ToPageFetchXml_PageZero_Throws()
        {
            Assert.Throws<System.ArgumentOutOfRangeException>(() => AudienceQuery.AllActive("account").ToPageFetchXml(0, 10, null));
        }
    }
}
