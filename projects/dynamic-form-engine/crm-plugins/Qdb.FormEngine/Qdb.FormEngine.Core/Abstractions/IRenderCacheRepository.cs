using System;
using Microsoft.Xrm.Sdk;

namespace Qdb.FormEngine.Core.Abstractions
{
    /// <summary>
    /// Persists and retrieves rendered form JSON cache entries stored in
    /// qdb_form_render_cache with the compressed JSON body in a file column.
    /// </summary>
    public interface IRenderCacheRepository
    {
        /// <summary>
        /// Creates a new cache record and uploads the compressed JSON bytes
        /// into the qdb_runtime_json file column using the block upload protocol.
        /// Supersedes any prior active caches for the same form/version/language after writing.
        /// </summary>
        /// <param name="request">All data required to persist the cache entry.</param>
        /// <returns>The GUID of the newly created cache record.</returns>
        Guid WriteCache(RenderCacheWriteRequest request);

        /// <summary>
        /// Finds the active cache record for the given form/version/language combination.
        /// Returns null when no active cache exists.
        /// </summary>
        /// <param name="formCode">The unique form code.</param>
        /// <param name="version">The form definition version number.</param>
        /// <param name="languageCode">Two-letter language code.</param>
        /// <returns>The matching Entity or null.</returns>
        Entity FindActiveCache(string formCode, int version, string languageCode);

        /// <summary>
        /// Marks all active cache records for the given form/version/language as superseded,
        /// except for the record identified by <paramref name="exceptId"/>.
        /// </summary>
        /// <param name="formCode">The unique form code.</param>
        /// <param name="version">The form definition version number.</param>
        /// <param name="languageCode">Two-letter language code.</param>
        /// <param name="exceptId">The newly written cache record to exclude from superseding.</param>
        void SupersedePriorCaches(string formCode, int version, string languageCode, Guid exceptId);
    }
}
