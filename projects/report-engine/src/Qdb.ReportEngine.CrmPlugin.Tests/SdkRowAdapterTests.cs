using System;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// The adapter is what lets the shared engine sources run unchanged on the SDK. If it projects
    /// an attribute differently from the Web API shape they were written against, the definition
    /// assembler silently reads nothing — so these assert against the shared RowReader itself rather
    /// than the dictionary, which is the contract that actually matters.
    /// </summary>
    public sealed class SdkRowAdapterTests
    {
        private const string FormattedSuffix = "@OData.Community.Display.V1.FormattedValue";
        private static readonly Guid ParentId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        [Fact]
        public void ToRow_UnwrapsLookupToItsId()
        {
            var record = new Entity("qdb_reportdatasource");
            record["qdb_reportdefinitionid"] = new EntityReference("qdb_reportdefinition", ParentId);

            var row = SdkRowAdapter.ToRow(record);

            Assert.Equal(ParentId, RowReader.Guid(row, "qdb_reportdefinitionid"));
        }

        [Fact]
        public void ToRow_ExposesLookupUnderTheWebApiSpellingToo()
        {
            // The shared reader falls back to `_x_value`; both spellings must resolve.
            var record = new Entity("qdb_reportdatasource");
            record["qdb_reportdefinitionid"] = new EntityReference("qdb_reportdefinition", ParentId);

            var row = SdkRowAdapter.ToRow(record);

            Assert.True(row.ContainsKey("_qdb_reportdefinitionid_value"));
        }

        [Fact]
        public void ToRow_UnwrapsOptionSetToItsCode()
        {
            var record = new Entity("qdb_reportfilter");
            record["qdb_operator"] = new OptionSetValue(100000000);
            record.FormattedValues.Add("qdb_operator", "Equals");

            var row = SdkRowAdapter.ToRow(record);
            var coded = RowReader.Coded(row, "qdb_operator");

            Assert.Equal(100000000, coded.Code);
            Assert.Equal("Equals", coded.Label);
        }

        [Fact]
        public void ToRow_UnwrapsMoneyToItsDecimal()
        {
            var record = new Entity("account");
            record["revenue"] = new Money(1234.56m);

            var row = SdkRowAdapter.ToRow(record);

            Assert.Equal(1234.56m, row["revenue"]);
        }

        [Fact]
        public void ToRow_UnwrapsAliasedValueFromALinkedEntity()
        {
            var record = new Entity("qdb_reportcolumn");
            record["ds.qdb_name"] = new AliasedValue("qdb_reportdatasource", "qdb_name", "Accounts view");

            var row = SdkRowAdapter.ToRow(record);

            Assert.Equal("Accounts view", RowReader.String(row, "ds.qdb_name"));
        }

        [Fact]
        public void ToRow_CarriesFormattedTextUnderTheAnnotationSuffix()
        {
            var record = new Entity("account");
            record["statecode"] = new OptionSetValue(0);
            record.FormattedValues.Add("statecode", "Active");

            var row = SdkRowAdapter.ToRow(record);

            Assert.Equal("Active", row["statecode" + FormattedSuffix]);
        }
    }
}
