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
        public void Write_WrapsEachRowInACellsObject()
        {
            // Consumers read row.cells[alias]; emitting the cell map bare made every column resolve
            // to nothing while rowCount still looked correct.
            var json = ReportResultJson.Write(Result("Acme"));

            Assert.Contains("\"rows\":[{\"cells\":{", json);
        }

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

        private static ReportDataset Standalone(string name, string status = DatasetStatus.Ok, string error = null) =>
            new ReportDataset
            {
                Id = "22222222-2222-2222-2222-222222222222",
                Name = name,
                Role = DatasetRole.Standalone,
                Columns = new[] { new ReportResultColumn { Alias = "code", Label = "Code", Attribute = "code" } },
                Rows = new[]
                {
                    new ReportResultRow
                    {
                        Cells = new Dictionary<string, ReportCell> { ["code"] = new ReportCell(null, "F-1182") }
                    }
                },
                RowCount = 1,
                ElapsedMs = 42,
                Status = status,
                Error = error
            };

        private static ReportResult WithStandalone(params ReportDataset[] datasets) =>
            Result("Acme") with { StandaloneDatasets = datasets };

        [Fact]
        public void Write_SingleDatasetReportKeepsTheShapeItAlwaysHad()
        {
            // ADR-RPT-012 §2. Every deployed report must serialise byte-for-byte as before, or the
            // four exports, every layout, drilldown and the dashboard would all have to change on the
            // same day. This is the assertion that keeps the migration incremental.
            var json = ReportResultJson.Write(Result("Acme"));

            Assert.DoesNotContain("\"datasets\"", json);
            Assert.Contains("\"columns\":", json);
            Assert.Contains("\"rows\":", json);
        }

        [Fact]
        public void Write_EmitsADatasetCollectionOnlyWhenThereIsMoreThanOne()
        {
            var json = ReportResultJson.Write(WithStandalone(Standalone("Overdue")));

            Assert.Contains("\"datasets\":[", json);
        }

        [Fact]
        public void Write_PutsTheRootDatasetFirst()
        {
            // Execution order is root, then joined, then standalone (MDS-FR-006). A consumer that
            // takes datasets[0] as the root must not depend on luck.
            var json = ReportResultJson.Write(WithStandalone(Standalone("Overdue")));

            Assert.Contains("\"datasets\":[{\"id\":", json);
            Assert.True(json.IndexOf("\"role\":\"root\"", StringComparison.Ordinal)
                < json.IndexOf("\"role\":\"standalone\"", StringComparison.Ordinal));
        }

        [Fact]
        public void Write_KeepsTheReportIdentityOutsideTheDatasets()
        {
            var json = ReportResultJson.Write(WithStandalone(Standalone("Overdue")));

            Assert.StartsWith("{\"reportId\":\"11111111-1111-1111-1111-111111111111\"", json);
            Assert.Contains("\"reportName\":\"Active Accounts\"", json);
        }

        [Fact]
        public void Write_GivesEachDatasetItsOwnColumnsAndRows()
        {
            // The whole point of a standalone block: it does not share the root's columns.
            var json = ReportResultJson.Write(WithStandalone(Standalone("Overdue")));

            Assert.Contains("\"alias\":\"name\"", json);
            Assert.Contains("\"alias\":\"code\"", json);
            Assert.Contains("F-1182", json);
        }

        [Fact]
        public void Write_ReportsEachDatasetsOwnTiming()
        {
            var json = ReportResultJson.Write(WithStandalone(Standalone("Overdue")));

            Assert.Contains("\"elapsedMs\":42", json);
        }

        [Fact]
        public void Write_TimesTheRootFromTheResultsOwnDuration()
        {
            // The root reported 0 ms in the organisation beside standalone blocks reporting real
            // figures, because nothing set Duration. That reads as an instant query rather than as a
            // number nobody filled in.
            var result = Result("Acme") with
            {
                Duration = TimeSpan.FromMilliseconds(250),
                StandaloneDatasets = new[] { Standalone("Overdue") }
            };

            var json = ReportResultJson.Write(result);

            Assert.Contains("\"elapsedMs\":250", json);
            Assert.Contains("\"elapsedMs\":42", json);
        }

        [Fact]
        public void Write_NamesAFailedDatasetRatherThanEmittingItEmpty()
        {
            // MDS-FR-016 / MDS-FR-028. An empty table reads as "nothing matched"; a failure must not
            // be indistinguishable from that.
            var json = ReportResultJson.Write(
                WithStandalone(Standalone("Overdue", DatasetStatus.Failed, "endpoint timed out")));

            Assert.Contains("\"status\":\"failed\"", json);
            Assert.Contains("\"error\":\"endpoint timed out\"", json);
        }

        [Fact]
        public void Write_MarksAHealthyDatasetOkWithNoError()
        {
            var json = ReportResultJson.Write(WithStandalone(Standalone("Overdue")));

            Assert.Contains("\"status\":\"ok\"", json);
            Assert.Contains("\"error\":null", json);
        }

        [Fact]
        public void Write_EscapesDatasetNamesLikeEveryOtherString()
        {
            // A dataset name is author-supplied and reaches the browser, so it is an injection vector
            // exactly as cell text is.
            var json = ReportResultJson.Write(WithStandalone(Standalone("<script>alert(1)</script>")));

            Assert.DoesNotContain("<script>", json);
        }

        [Fact]
        public void Write_EmitsEveryStandaloneDataset()
        {
            var json = ReportResultJson.Write(WithStandalone(Standalone("First"), Standalone("Second")));

            Assert.Contains("\"name\":\"First\"", json);
            Assert.Contains("\"name\":\"Second\"", json);
        }
    }
}
