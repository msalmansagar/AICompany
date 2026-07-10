using System.Linq;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// Validation of N:1 related-field inputs (the `via` navigation): the lookup must exist
    /// on the anchor and the bound field must exist on the related entity.
    /// </summary>
    public class RelatedFieldValidationTests
    {
        private static IMetadataResolver Metadata() => new InMemoryMetadataResolver()
            .AddAttribute("qdb_loanapplication", "qdb_loanamount", FieldType.Currency)
            .AddAttribute("qdb_loanapplication", "qdb_accountid", FieldType.Text)
            .AddAttribute("account", "qdb_creditscore", FieldType.Decimal);

        private static PcrmDocument DocWith(PcrmInput related)
        {
            var doc = new PcrmDocument { TargetEntity = "qdb_loanapplication" };
            doc.Inputs.Add(new PcrmInput { Name = "loanAmount", Type = "Currency", Binding = "qdb_loanamount" });
            doc.Inputs.Add(related);
            doc.Logic.Rules.Add(new PcrmConditionRule());
            return doc;
        }

        [Fact]
        public void Related_field_on_related_entity_is_valid()
        {
            var doc = DocWith(new PcrmInput
            {
                Name = "creditScore", Type = "Decimal", Binding = "qdb_creditscore",
                Via = new PcrmVia { Relationship = "qdb_accountid", Entity = "account" }
            });

            var diagnostics = new RuleValidator(Metadata()).Validate(doc);

            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP005" || d.Code == "EDP006" || d.Code == "EDP007");
        }

        [Fact]
        public void Unknown_field_on_related_entity_is_an_error()
        {
            var doc = DocWith(new PcrmInput
            {
                Name = "creditScore", Type = "Decimal", Binding = "qdb_nonexistent",
                Via = new PcrmVia { Relationship = "qdb_accountid", Entity = "account" }
            });

            var diagnostics = new RuleValidator(Metadata()).Validate(doc);

            Assert.Contains(diagnostics, d => d.Code == "EDP007" && d.Severity == RuleErrorSeverity.Error);
        }

        [Fact]
        public void Unknown_lookup_on_anchor_is_an_error()
        {
            var doc = DocWith(new PcrmInput
            {
                Name = "creditScore", Type = "Decimal", Binding = "qdb_creditscore",
                Via = new PcrmVia { Relationship = "qdb_missinglookup", Entity = "account" }
            });

            var diagnostics = new RuleValidator(Metadata()).Validate(doc);

            Assert.Contains(diagnostics, d => d.Code == "EDP005" && d.Severity == RuleErrorSeverity.Error);
        }
    }
}
