using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// Author-time diagnostics for quantifiers (EDP-FACT-001 F1). A quantifier that cannot
    /// possibly work should be caught at save, not at 3am in a payment run.
    /// </summary>
    public class QuantifierValidationTests
    {
        private static PcrmDocument RuleWith(PcrmQuantifier quantifier) => new PcrmDocument
        {
            RuleId = "q",
            Name = "Quantifier rule",
            TargetEntity = "qdb_disbursement",
            Inputs = { new PcrmInput { Name = "invoices", Type = "Text" } },
            Outputs = { new PcrmOutput { Name = "verdict", Type = "Text" } },
            Logic = new PcrmLogic
            {
                Type = "conditionSet",
                Rules = { new PcrmConditionRule { When = new PcrmGroup { Quantifiers = { quantifier } } } }
            }
        };

        private static PcrmQuantifier Quantifier(string kind = "all", string collection = "invoices")
            => new PcrmQuantifier
            {
                Kind = kind,
                Collection = collection,
                Where = new PcrmGroup
                {
                    Conditions = { new PcrmCondition { Field = "beneficiaryName", Operator = "IsNotEmpty" } }
                }
            };

        private static IReadOnlyList<RuleDiagnostic> Validate(PcrmDocument document)
            => new RuleValidator(new InMemoryMetadataResolver()).Validate(document);

        private static bool HasError(IEnumerable<RuleDiagnostic> diagnostics, string code)
            => diagnostics.Any(d => d.Code == code && d.Severity == RuleErrorSeverity.Error);

        [Fact]
        public void A_well_formed_quantifier_produces_no_errors()
            => Assert.DoesNotContain(Validate(RuleWith(Quantifier())), d => d.Severity == RuleErrorSeverity.Error);

        [Fact]
        public void Unknown_quantifier_kind_is_an_error()
            => Assert.True(HasError(Validate(RuleWith(Quantifier(kind: "most"))), "EDP040"));

        [Fact]
        public void Quantifier_over_an_undeclared_collection_is_an_error()
            => Assert.True(HasError(Validate(RuleWith(Quantifier(collection: "ghosts"))), "EDP041"));

        [Fact]
        public void Quantifier_without_a_collection_is_an_error()
            => Assert.True(HasError(Validate(RuleWith(Quantifier(collection: ""))), "EDP041"));

        [Fact]
        public void Empty_predicate_warns_because_every_element_satisfies_it()
        {
            var quantifier = Quantifier();
            quantifier.Where = new PcrmGroup();

            var diagnostics = Validate(RuleWith(quantifier));

            Assert.Contains(diagnostics, d => d.Code == "EDP042" && d.Severity == RuleErrorSeverity.Warning);
        }

        [Fact]
        public void Element_field_references_inside_the_body_are_not_reported_as_undeclared()
        {
            // The element schema is not known until retrieval declares it (F2). Checking child
            // fields against the rule's own symbols would flag every legitimate reference.
            var diagnostics = Validate(RuleWith(Quantifier()));

            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP004");
        }

        [Fact]
        public void An_unknown_operator_inside_the_body_is_still_reported()
        {
            // Suppressing symbol checks must not suppress everything else.
            var quantifier = Quantifier();
            quantifier.Where.Conditions[0].Operator = "Frobnicate";

            Assert.True(HasError(Validate(RuleWith(quantifier)), "EDP003"));
        }
    }
}
