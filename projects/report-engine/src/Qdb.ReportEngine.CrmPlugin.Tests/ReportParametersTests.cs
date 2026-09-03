using Qdb.ReportEngine.CrmPlugin.Engine;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// The parameter reader takes caller-supplied text, so its failure modes matter more than its
    /// happy path — a wrong parse silently changes which rows a report returns.
    /// </summary>
    public sealed class ReportParametersTests
    {
        [Fact]
        public void Parse_ReadsStringValues()
        {
            var values = ReportParameters.Parse("{\"Branch\":\"Doha\",\"Status\":\"Active\"}");

            Assert.Equal("Doha", values["Branch"]);
            Assert.Equal("Active", values["Status"]);
        }

        [Fact]
        public void Parse_MatchesKeysCaseInsensitively()
        {
            // A caller sending {"loanid": …} against a declared "LoanId" is supplying the
            // parameter; declared names are matched case-insensitively everywhere else.
            var values = ReportParameters.Parse("{\"loanid\":\"LN-1\"}");

            Assert.Equal("LN-1", values["LoanId"]);
        }

        [Fact]
        public void Parse_ReadsNumbersAndBooleansAsText()
        {
            var values = ReportParameters.Parse("{\"Limit\":250,\"IncludeClosed\":true}");

            Assert.Equal("250", values["Limit"]);
            Assert.Equal("true", values["IncludeClosed"]);
        }

        [Fact]
        public void Parse_TreatsNullAsNoValue()
        {
            var values = ReportParameters.Parse("{\"Branch\":null}");

            Assert.Null(values["Branch"]);
        }

        [Fact]
        public void Parse_HonoursEscapedCharacters()
        {
            var values = ReportParameters.Parse("{\"Name\":\"O\\\"Brien\\tLtd\"}");

            Assert.Equal("O\"Brien\tLtd", values["Name"]);
        }

        [Fact]
        public void Parse_HonoursUnicodeEscapes()
        {
            var values = ReportParameters.Parse("{\"City\":\"\\u0627\\u0644\\u062f\\u0648\\u062d\\u0629\"}");

            Assert.Equal("الدوحة", values["City"]);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("{}")]
        public void Parse_WithNothingToRead_ReturnsEmpty(string json)
        {
            Assert.Empty(ReportParameters.Parse(json));
        }
    }
}
