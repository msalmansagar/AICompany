using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EDP.RuleRuntime.Pcrm
{
    /// <summary>
    /// A declared population retrieval: fetch records that are NOT anchored to the target record,
    /// and expose them as a named collection the rule can quantify over (FR-F10).
    ///
    /// The filter deliberately reuses <see cref="PcrmGroup"/> rather than inventing a query
    /// language. That gives runtime values for free — a condition's <c>valueField</c> already
    /// resolves against the execution context — and it keeps boundary B-6 intact: the primitive
    /// set stays closed, and adding to it takes an ADR rather than a backlog ticket.
    /// </summary>
    public sealed class PcrmRetrieval
    {
        /// <summary>Name of the collection this produces. Rules reference it like any other input.</summary>
        [JsonPropertyName("name")] public string Name { get; set; } = "";

        /// <summary>Logical name of the entity to search.</summary>
        [JsonPropertyName("entity")] public string Entity { get; set; } = "";

        /// <summary>Fields to bring back. Each becomes a field on the resulting elements.</summary>
        [JsonPropertyName("select")] public List<string> Select { get; set; } = new List<string>();

        /// <summary>
        /// MANDATORY (FR-F11). An unfiltered population read is rejected at author time — a rule
        /// that would scan a whole table should never reach publish, let alone a payment run.
        /// </summary>
        [JsonPropertyName("filter")] public PcrmGroup? Filter { get; set; }

        /// <summary>Field to order by. Required when <see cref="GroupBy"/> selects by position.</summary>
        [JsonPropertyName("orderBy")] public string? OrderBy { get; set; }

        [JsonPropertyName("descending")] public bool Descending { get; set; }

        /// <summary>
        /// Row ceiling (FR-F13). Exceeding it FAILS the evaluation rather than returning a partial
        /// population — a silently truncated duplicate check reads as "no duplicate found".
        /// </summary>
        [JsonPropertyName("maxRows")] public int MaxRows { get; set; }

        /// <summary>Optional collapse to one record per key (FR-F14).</summary>
        [JsonPropertyName("groupBy")] public PcrmGroupByArgMax? GroupBy { get; set; }
    }

    /// <summary>
    /// Collapse a population to one element per key — "the latest purchase per line-item ref by LC
    /// issuance date" is exactly this shape.
    /// </summary>
    public sealed class PcrmGroupByArgMax
    {
        /// <summary>Field whose value defines the group.</summary>
        [JsonPropertyName("key")] public string Key { get; set; } = "";

        /// <summary>Field the winner is chosen by.</summary>
        [JsonPropertyName("by")] public string By { get; set; } = "";

        /// <summary>latest | earliest | highest | lowest.</summary>
        [JsonPropertyName("select")] public string Select { get; set; } = "latest";
    }
}
