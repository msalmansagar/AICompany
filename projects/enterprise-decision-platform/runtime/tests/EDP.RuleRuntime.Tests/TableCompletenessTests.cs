using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>Static completeness/overlap analysis of decision tables (advisory warnings).</summary>
    public class TableCompletenessTests
    {
        private static readonly JsonSerializerOptions Opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        // JSON authored with single quotes for readability, then swapped to double quotes.
        private static IReadOnlyList<RuleDiagnostic> Analyze(string hitPolicy, string rows)
        {
            var json = ("{ 'name':'t','targetEntity':'e','inputs':[{'name':'amt','type':'Decimal'}],'outputs':[{'name':'r','type':'Text'}],"
                + "'logic':{'type':'decisionTable','hitPolicy':'" + hitPolicy + "','tableInputs':[{'field':'amt'}],'outputColumns':['r'],'rows':" + rows + "}}")
                .Replace('\'', '"');
            return TableCompletenessAnalyzer.Analyze(JsonSerializer.Deserialize<PcrmDocument>(json, Opts)!);
        }
        private static bool Has(IReadOnlyList<RuleDiagnostic> d, string code) => d.Any(x => x.Code == code);

        [Fact]
        public void Unreachable_row_is_flagged()
        {
            var d = Analyze("First",
                "[{'cells':[{'operator':'GreaterThanOrEqual','value':0}],'outputs':{'r':'a'}},"
                + "{'cells':[{'operator':'GreaterThan','value':500000}],'outputs':{'r':'b'}}]");
            Assert.True(Has(d, "EDP020")); // row 2 can never fire; row 1 (>= 0) already covers it
        }

        [Fact]
        public void Redundant_rows_are_flagged()
        {
            var d = Analyze("First",
                "[{'cells':[{'operator':'Equals','value':100}],'outputs':{'r':'a'}},"
                + "{'cells':[{'operator':'Equals','value':100}],'outputs':{'r':'b'}}]");
            Assert.True(Has(d, "EDP021"));
        }

        [Fact]
        public void Overlapping_rows_are_flagged_for_unordered_policies()
        {
            var d = Analyze("All",
                "[{'cells':[{'operator':'GreaterThan','value':100}],'outputs':{'r':'a'}},"
                + "{'cells':[{'operator':'LessThan','value':200}],'outputs':{'r':'b'}}]");
            Assert.True(Has(d, "EDP022")); // (100, 200) satisfies both
        }

        [Fact]
        public void Missing_catch_all_is_flagged()
        {
            var d = Analyze("First",
                "[{'cells':[{'operator':'Equals','value':5}],'outputs':{'r':'a'}},"
                + "{'cells':[{'operator':'Equals','value':10}],'outputs':{'r':'b'}}]");
            Assert.True(Has(d, "EDP023"));
        }

        [Fact]
        public void A_well_formed_table_has_no_completeness_findings()
        {
            var d = Analyze("First",
                "[{'cells':[{'operator':'GreaterThan','value':500000}],'outputs':{'r':'CEO'}},"
                + "{'cells':[{'any':true}],'outputs':{'r':'Manager'}}]");
            Assert.DoesNotContain(d, x => x.Code == "EDP020" || x.Code == "EDP021" || x.Code == "EDP022" || x.Code == "EDP023");
        }
    }
}
