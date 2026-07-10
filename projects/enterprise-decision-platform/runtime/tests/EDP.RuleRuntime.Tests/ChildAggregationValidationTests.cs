using System.Linq;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// Validation of 1:N aggregate inputs: the child entity, its lookup back to the anchor,
    /// the aggregated field, and any filter field must exist on the child entity.
    /// </summary>
    public class ChildAggregationValidationTests
    {
        private static IMetadataResolver Metadata() => new InMemoryMetadataResolver()
            .AddAttribute("qdb_loanapplication", "qdb_name", FieldType.Text)
            .AddAttribute("qdb_collateral", "qdb_loanid", FieldType.Text)
            .AddAttribute("qdb_collateral", "qdb_value", FieldType.Currency)
            .AddAttribute("qdb_collateral", "qdb_status", FieldType.Text);

        private static PcrmDocument DocWith(PcrmInput input)
        {
            var doc = new PcrmDocument { TargetEntity = "qdb_loanapplication" };
            doc.Inputs.Add(input);
            doc.Logic.Rules.Add(new PcrmConditionRule());
            return doc;
        }

        private static PcrmInput Sum(string binding, PcrmAggregateFilter? filter = null) => new PcrmInput
        {
            Name = "total", Type = "Decimal", Binding = binding,
            Aggregate = new PcrmAggregate { Function = "Sum", ChildEntity = "qdb_collateral", ChildLookup = "qdb_loanid", Filter = filter },
        };

        [Fact]
        public void Valid_aggregate_has_no_child_errors()
        {
            var diagnostics = new RuleValidator(Metadata()).Validate(DocWith(Sum("qdb_value")));
            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP008" || d.Code == "EDP009" || d.Code == "EDP012" || d.Code == "EDP013");
        }

        [Fact]
        public void Unknown_child_entity_warns()
        {
            var input = Sum("qdb_value");
            input.Aggregate!.ChildEntity = "qdb_ghost";
            var diagnostics = new RuleValidator(Metadata()).Validate(DocWith(input));
            Assert.Contains(diagnostics, d => d.Code == "EDP008");
        }

        [Fact]
        public void Missing_child_lookup_is_an_error()
        {
            var input = Sum("qdb_value");
            input.Aggregate!.ChildLookup = "qdb_missing";
            var diagnostics = new RuleValidator(Metadata()).Validate(DocWith(input));
            Assert.Contains(diagnostics, d => d.Code == "EDP009" && d.Severity == RuleErrorSeverity.Error);
        }

        [Fact]
        public void Sum_without_a_field_is_an_error()
        {
            var input = Sum("");
            var diagnostics = new RuleValidator(Metadata()).Validate(DocWith(input));
            Assert.Contains(diagnostics, d => d.Code == "EDP012" && d.Severity == RuleErrorSeverity.Error);
        }

        [Fact]
        public void Count_needs_no_field()
        {
            var input = Sum("");
            input.Aggregate!.Function = "Count";
            var diagnostics = new RuleValidator(Metadata()).Validate(DocWith(input));
            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP012");
        }

        [Fact]
        public void Unknown_filter_field_is_an_error()
        {
            var input = Sum("qdb_value", new PcrmAggregateFilter { Field = "qdb_ghostfield", Operator = "Equals" });
            var diagnostics = new RuleValidator(Metadata()).Validate(DocWith(input));
            Assert.Contains(diagnostics, d => d.Code == "EDP013" && d.Severity == RuleErrorSeverity.Error);
        }
    }
}
