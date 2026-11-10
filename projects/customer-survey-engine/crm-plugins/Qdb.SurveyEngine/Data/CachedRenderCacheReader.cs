using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Remembers published versions for one run, so a scheduled run over hundreds of customers reads
    /// each form's render cache once per language instead of once per customer.
    /// </summary>
    public sealed class CachedRenderCacheReader : IRenderCacheReader
    {
        private readonly IRenderCacheReader _inner;
        private readonly Dictionary<string, int?> _versions = new Dictionary<string, int?>(StringComparer.Ordinal);

        public CachedRenderCacheReader(IRenderCacheReader inner)
        {
            _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        }

        /// <inheritdoc />
        public int? FindActivePublishedVersion(string formCode, string languageCode)
        {
            var key = formCode + "|" + languageCode;
            int? version;
            if (!_versions.TryGetValue(key, out version)) _versions[key] = version = _inner.FindActivePublishedVersion(formCode, languageCode);
            return version;
        }
    }
}
