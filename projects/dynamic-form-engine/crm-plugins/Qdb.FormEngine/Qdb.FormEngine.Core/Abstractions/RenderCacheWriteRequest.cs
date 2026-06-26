using System;

namespace Qdb.FormEngine.Core.Abstractions
{
    /// <summary>
    /// Value object carrying all data required to persist a single
    /// language variant of a rendered form JSON into qdb_form_render_cache.
    /// </summary>
    public sealed class RenderCacheWriteRequest
    {
        /// <summary>The unique form code identifying the form definition.</summary>
        public string FormCode { get; set; }

        /// <summary>The form definition version number this cache entry represents.</summary>
        public int Version { get; set; }

        /// <summary>Two-letter language code (e.g. "en", "ar").</summary>
        public string LanguageCode { get; set; }

        /// <summary>CRM LCID for this language (e.g. 1033 for English).</summary>
        public int Lcid { get; set; }

        /// <summary>GZip-compressed UTF-8 JSON bytes of the rendered form definition.</summary>
        public byte[] JsonBytes { get; set; }

        /// <summary>SHA-256 hex hash of <see cref="JsonBytes"/> for integrity verification.</summary>
        public string JsonHash { get; set; }

        /// <summary>Size in bytes of the compressed JSON payload.</summary>
        public long JsonSizeBytes { get; set; }

        /// <summary>Semantic version of the generator that produced this cache entry.</summary>
        public string GeneratorVersion { get; set; }

        /// <summary>Wall-clock duration in milliseconds taken to generate this cache entry.</summary>
        public long GenerationDurationMs { get; set; }

        /// <summary>GUID of the parent qdb_form_definition record.</summary>
        public Guid FormDefinitionId { get; set; }

        /// <summary>GUID of the qdb_publish_job record that triggered this generation.</summary>
        public Guid PublishJobId { get; set; }

        /// <summary>GUID of the user or system account that initiated the publish, if available.</summary>
        public Guid? PublishedBy { get; set; }
    }
}
