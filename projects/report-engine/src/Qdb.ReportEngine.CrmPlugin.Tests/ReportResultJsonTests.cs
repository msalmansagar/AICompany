using System;
using System.Collections.Generic;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Qdb.ReportEngine.Core.Models;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// This JSON is consumed by a browser, so escaping is a security property rather than a
    /// formatting preference.
    /// </summary>
    public sealed class ReportResultJsonTests
    {
        private static readonly Guid ReportId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        private static ReportResult Result(string cellText, object cellValue = null) => new ReportResult
        {
            ReportId = ReportId,
            ReportName = "Active Accounts",
            Columns = new[] { new ReportResultColumn { Alias = "name", Label = "Name", Attribute = "name" } },
            Rows = new[]
            {
                new ReportResultRow
                {
                    Cells = new Dictionary<string, ReportCell> { ["name"] = new ReportCell(cellValue, cellText) }
                }
            },
            RowCount = 1
        };

        [Fact]
        public void Write_EmitsReportIdentity()
        {
            var json = ReportResultJson.Write(Result("Acme"));

            Assert.Contains("\"reportId\":\"11111111-1111-1111-1111-111111111111\"", json);
            Assert.Contains("\"reportName\":\"Active Accounts\"", json);
            Assert.Contains("\"rowCount\":1", json);
        }

        [Fact]
        public void Write_EscapesQuotesAndBackslashes()
        {
            var json = ReportResultJson.Write(Result("O\"Brien\\Co"));

            Assert.Contains("O\\\"Brien\\\\Co", json);
        }

        [Fact]
        public void Write_EscapesHtmlSignificantCharacters()
        {
            // A cell containing markup must not be able to close a script element in the host page.
            var json = ReportResultJson.Write(Result("<script>alert(1)</script>"));

            Assert.DoesNotContain("<script>", json);
            Assert.Contains("\\u003c", json);
        }

        [Fact]
        public void Write_EscapesControlCharacters()
        {
            var json = ReportResultJson.Write(Result("line\nbreak"));

            Assert.Contains("line\\nbreak", json);
            Assert.DoesNotContain("line\nbreak", json);
        }

        [Fact]
        public void Write_EmitsNumbersUnquoted()
        {
            var json = ReportResultJson.Write(Result("1,234", 1234));

            Assert.Contains("\"value\":1234", json);
        }

        [Fact]
        public void Write_EmitsNullValueAsNull()
        {
            var json = ReportResultJson.Write(Result(null));

            Assert.Contains("\"value\":null", json);
            Assert.Contains("\"text\":null", json);
        }

        [Fact]
        public void Write_EmitsBooleansUnquoted()
        {
            var json = ReportResultJson.Write(Result("Yes", true));

            Assert.Contains("\"value\":true", json);
        }
    }
}
