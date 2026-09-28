using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Compiler;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Pcrm;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>FR-B1 / FR-B2 author-time checks (EDP064, 065, 066, 068, 069).</summary>
    public class InputContractRulesTests
    {
        private static IReadOnlyList<RuleDiagnostic> Validate(string pcrm)
            => new RuleValidator(new InMemoryMetadataResolver()).Validate(JsonSerializer.Deserialize<PcrmDocument>(pcrm)!);

        private static string Strict(string inputs, string logic)
            => "{\"schemaVersion\":\"1.1\",\"inputContract\":\"strict\",\"inputs\":[" + inputs + "],\"outputs\":[{\"name\":\"o\",\"type\":\"Text\"}],\"logic\":" + logic + "}";

        private const string EmptyLogic = "{\"type\":\"conditionSet\",\"otherwise\":{\"o\":\"x\"}}";

        [Fact]
        public void Validate_UnboundInput_ReportsDeclaredFactNotice()
        {
            var diagnostics = Validate("{\"inputs\":[{\"name\":\"tier\",\"type\":\"Text\"}],\"logic\":" + EmptyLogic + "}");
            Assert.Contains(diagnostics, d => d.Code == "EDP064" && d.Severity == RuleErrorSeverity.Info);
        }

        [Fact]
        public void Validate_BoundInput_IsNotADeclaredFact()
        {
            var diagnostics = Validate("{\"inputs\":[{\"name\":\"tier\",\"type\":\"Text\",\"binding\":\"qdb_tier\"}],\"logic\":" + EmptyLogic + "}");
            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP064");
        }

        [Fact]
        public void Validate_DeclaredMarkerWithBinding_ReportsEdp069()
        {
            var diagnostics = Validate("{\"inputs\":[{\"name\":\"tier\",\"type\":\"Text\",\"source\":\"declared\",\"binding\":\"qdb_tier\"}],\"logic\":" + EmptyLogic + "}");
            Assert.Contains(diagnostics, d => d.Code == "EDP069" && d.Severity == RuleErrorSeverity.Error);
        }

        [Fact]
        public void Validate_StrictContractWithOldSchemaVersion_ReportsEdp065()
        {
            var diagnostics = Validate("{\"schemaVersion\":\"1.0\",\"inputContract\":\"strict\",\"logic\":" + EmptyLogic + "}");
            Assert.Contains(diagnostics, d => d.Code == "EDP065" && d.Severity == RuleErrorSeverity.Error);
        }

        [Fact]
        public void Validate_NewSchemaVersionWithoutStrictContract_IsLenientAndValid()
        {
            var diagnostics = Validate("{\"schemaVersion\":\"1.1\",\"logic\":" + EmptyLogic + "}");
            Assert.DoesNotContain(diagnostics, d => d.Severity == RuleErrorSeverity.Error);
        }

        [Fact]
        public void Validate_StrictLookupInput_ReportsEdp066()
        {
            var diagnostics = Validate(Strict("{\"name\":\"owner\",\"type\":\"Lookup\"}", EmptyLogic));
            Assert.Contains(diagnostics, d => d.Code == "EDP066" && d.Location == "owner");
        }

        [Fact]
        public void Validate_LenientLookupInput_IsAllowed()
        {
            var diagnostics = Validate("{\"inputs\":[{\"name\":\"owner\",\"type\":\"Lookup\"}],\"logic\":" + EmptyLogic + "}");
            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP066");
        }

        [Fact]
        public void Validate_StrictQuantifierOverTextInput_ReportsEdp066()
        {
            const string logic = "{\"type\":\"conditionSet\",\"rules\":[{\"when\":{\"op\":\"and\",\"quantifiers\":[{\"kind\":\"some\",\"collection\":\"lines\",\"where\":{\"op\":\"and\",\"conditions\":[{\"field\":\"amount\",\"operator\":\"GreaterThan\",\"value\":1}]}}]},\"then\":{\"o\":\"y\"}}],\"otherwise\":{\"o\":\"n\"}}";
            var diagnostics = Validate(Strict("{\"name\":\"lines\",\"type\":\"Text\"}", logic));
            Assert.Contains(diagnostics, d => d.Code == "EDP066" && d.Location == "lines");
        }

        [Fact]
        public void Validate_StrictQuantifierOverCollectionInput_IsValid()
        {
            const string logic = "{\"type\":\"conditionSet\",\"rules\":[{\"when\":{\"op\":\"and\",\"quantifiers\":[{\"kind\":\"some\",\"collection\":\"lines\",\"where\":{\"op\":\"and\",\"conditions\":[{\"field\":\"amount\",\"operator\":\"GreaterThan\",\"value\":1}]}}]},\"then\":{\"o\":\"y\"}}],\"otherwise\":{\"o\":\"n\"}}";
            var diagnostics = Validate(Strict("{\"name\":\"lines\",\"type\":\"Collection\"}", logic));
            Assert.DoesNotContain(diagnostics, d => d.Severity == RuleErrorSeverity.Error);
        }

        [Theory]
        [InlineData("1e-30")]
        [InlineData("1e40")]
        [InlineData("0.12345678901234567890123456789")]
        public void Validate_StrictInexactNumericLiteral_ReportsEdp068(string literal)
        {
            var logic = "{\"type\":\"conditionSet\",\"rules\":[{\"when\":{\"op\":\"and\",\"conditions\":[{\"field\":\"amount\",\"operator\":\"GreaterThan\",\"value\":" + literal + "}]},\"then\":{\"o\":\"y\"}}],\"otherwise\":{\"o\":\"n\"}}";
            var diagnostics = Validate(Strict("{\"name\":\"amount\",\"type\":\"Decimal\"}", logic));
            Assert.Contains(diagnostics, d => d.Code == "EDP068");
        }

        [Theory]
        [InlineData("0.1")]
        [InlineData("1.50")]
        [InlineData("1e3")]
        [InlineData("79228162514264337593543950335")]
        public void Validate_StrictExactNumericLiteral_IsValid(string literal)
        {
            var logic = "{\"type\":\"conditionSet\",\"rules\":[{\"when\":{\"op\":\"and\",\"conditions\":[{\"field\":\"amount\",\"operator\":\"GreaterThan\",\"value\":" + literal + "}]},\"then\":{\"o\":" + literal + "}}],\"otherwise\":{\"o\":\"n\"}}";
            var diagnostics = Validate(Strict("{\"name\":\"amount\",\"type\":\"Decimal\"}", logic));
            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP068");
        }

        [Fact]
        public void Validate_StrictInexactLiteralInTableOutput_ReportsEdp068()
        {
            const string logic = "{\"type\":\"decisionTable\",\"tableInputs\":[{\"field\":\"amount\"}],\"outputColumns\":[\"o\"],\"rows\":[{\"priority\":1,\"cells\":[{\"operator\":\"Any\",\"any\":true}],\"outputs\":{\"o\":[1e-40]}}]}";
            var diagnostics = Validate(Strict("{\"name\":\"amount\",\"type\":\"Decimal\"}", logic));
            Assert.Contains(diagnostics, d => d.Code == "EDP068");
        }

        [Fact]
        public void Validate_LenientInexactLiteral_IsNotChecked()
        {
            var logic = "{\"type\":\"conditionSet\",\"rules\":[{\"when\":{\"op\":\"and\",\"conditions\":[{\"field\":\"amount\",\"operator\":\"GreaterThan\",\"value\":1e-30}]},\"then\":{\"o\":\"y\"}}],\"otherwise\":{\"o\":\"n\"}}";
            var diagnostics = Validate("{\"inputs\":[{\"name\":\"amount\",\"type\":\"Decimal\"}],\"logic\":" + logic + "}");
            Assert.DoesNotContain(diagnostics, d => d.Code == "EDP068");
        }

        [Fact]
        public void Compile_StrictRuleWithError_Throws()
        {
            var compiler = new RuleCompiler(new InMemoryMetadataResolver());
            Assert.Throws<RuleCompilationException>(() => compiler.Compile(Strict("{\"name\":\"owner\",\"type\":\"Lookup\"}", EmptyLogic)));
        }
    }
}
