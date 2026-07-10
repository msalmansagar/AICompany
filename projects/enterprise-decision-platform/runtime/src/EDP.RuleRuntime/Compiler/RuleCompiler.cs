using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Compiler
{
    /// <summary>
    /// Parses PCRM JSON, validates it, and produces a CompiledRule. Compilation is a
    /// query (no side effects); on blocking errors it throws RuleCompilationException
    /// carrying the diagnostics rather than returning null.
    /// </summary>
    public sealed class RuleCompiler
    {
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        private readonly RuleValidator _validator;

        public RuleCompiler(IMetadataResolver metadata) => _validator = new RuleValidator(metadata);

        public CompiledRule Compile(string pcrmJson)
        {
            if (string.IsNullOrWhiteSpace(pcrmJson))
                throw new RuleCompilationException("PCRM JSON is empty.",
                    new[] { new RuleDiagnostic("EDP000", "Empty PCRM payload.") });

            PcrmDocument document;
            try
            {
                document = JsonSerializer.Deserialize<PcrmDocument>(pcrmJson, JsonOptions)
                           ?? throw new JsonException("PCRM deserialized to null.");
            }
            catch (JsonException ex)
            {
                throw new RuleCompilationException("PCRM JSON is not well-formed.",
                    new[] { new RuleDiagnostic("EDP005", ex.Message) }, ex);
            }

            var diagnostics = _validator.Validate(document);
            var blocking = diagnostics.Where(d => d.Severity == RuleErrorSeverity.Error).ToList();
            if (blocking.Count > 0)
                throw new RuleCompilationException($"Rule '{document.Name}' failed validation with {blocking.Count} error(s).", diagnostics);

            return new CompiledRule(document, ComputeHash(pcrmJson));
        }

        public static string ComputeHash(string content)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(content));
            return Convert.ToBase64String(bytes);
        }
    }
}
