using System;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Default implementation of <see cref="ITranslationResolver"/>.
    /// Performs a dictionary lookup against the translation map and falls back
    /// to the English base value when no entry is found.
    /// </summary>
    public sealed class TranslationResolver : ITranslationResolver
    {
        /// <summary>
        /// Looks up a translated value in the map using the composite key
        /// "{entityName}:{recordId}:{fieldName}". Returns <paramref name="englishFallback"/>
        /// when the key is absent or the map itself is null.
        /// </summary>
        /// <param name="map">The translation map for the current language.</param>
        /// <param name="entityName">CRM entity logical name.</param>
        /// <param name="recordId">GUID of the record being translated.</param>
        /// <param name="fieldName">Attribute schema name.</param>
        /// <param name="englishFallback">Base English value used when no translation is found.</param>
        /// <returns>Translated value or the English fallback.</returns>
        public string Resolve(TranslationMap map, string entityName, Guid recordId, string fieldName, string englishFallback)
        {
            if (map == null)
                return englishFallback;

            string translatedValue;
            if (map.TryGetValue(entityName, recordId, fieldName, out translatedValue))
                return translatedValue;

            return englishFallback;
        }
    }
}
