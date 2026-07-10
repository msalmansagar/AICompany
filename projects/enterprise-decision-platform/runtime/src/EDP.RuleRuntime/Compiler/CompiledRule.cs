using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Compiler
{
    /// <summary>
    /// A validated, ready-to-execute rule. In this slice it wraps the parsed PCRM
    /// document plus its content hash (the cache key). The compiled representation is
    /// deliberately separated from the raw JSON so the executor never re-parses.
    /// </summary>
    public sealed class CompiledRule
    {
        public CompiledRule(PcrmDocument document, string contentHash)
        {
            Document = document;
            ContentHash = contentHash;
        }

        public PcrmDocument Document { get; }
        public string ContentHash { get; }
        public string RuleId => Document.RuleId;
        public string SchemaVersion => Document.SchemaVersion;
    }
}
