using System;
using Qdb.ReportEngine.CrmPlugin.Model;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    // InlineData carries strings (not the internal ReportFormat enum) so the public [Theory]
    // signatures stay accessible; the enum is referenced only inside the method bodies.
    public sealed class ReportFormatTests
    {
        [Theory]
        [InlineData("RUN", "Run")]
        [InlineData("pdf", "Pdf")]
        [InlineData("Xlsx", "Xlsx")]
        [InlineData("DOCX", "Docx")]
        [InlineData("csv", "Csv")]
        [InlineData("png", "Png")]
        public void Parse_MapsKnownFormats_CaseInsensitively(string input, string expected)
        {
            Assert.Equal(expected, ReportFormatExtensions.Parse(input).ToString());
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Parse_DefaultsToRun_WhenBlank(string input)
        {
            Assert.Equal(ReportFormat.Run, ReportFormatExtensions.Parse(input));
        }

        [Fact]
        public void Parse_Throws_OnUnknownFormat()
        {
            Assert.Throws<ArgumentException>(() => ReportFormatExtensions.Parse("html"));
        }

        [Theory]
        [InlineData("Pdf", "pdf")]
        [InlineData("Xlsx", "excel")]
        [InlineData("Docx", "word")]
        [InlineData("Csv", "csv")]
        [InlineData("Png", "image")]
        public void ToExportQueryValue_MapsToMiddleTierFormat(string formatName, string expected)
        {
            var format = (ReportFormat)Enum.Parse(typeof(ReportFormat), formatName);
            Assert.Equal(expected, format.ToExportQueryValue());
        }

        [Fact]
        public void ToExportQueryValue_Throws_ForRun()
        {
            Assert.Throws<InvalidOperationException>(() => ReportFormat.Run.ToExportQueryValue());
        }

        [Theory]
        [InlineData("Run", false)]
        [InlineData("Pdf", true)]
        [InlineData("Csv", true)]
        public void IsExport_IsTrue_ForEveryFormatExceptRun(string formatName, bool expected)
        {
            var format = (ReportFormat)Enum.Parse(typeof(ReportFormat), formatName);
            Assert.Equal(expected, format.IsExport());
        }
    }
}
