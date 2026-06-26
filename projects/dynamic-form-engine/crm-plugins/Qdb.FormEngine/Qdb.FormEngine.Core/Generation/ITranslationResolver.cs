using System;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Resolves translated string values from a <see cref="TranslationMap"/>,
    /// falling back to the English base value when no translation is found.
    /// </summary>
    public interface ITranslationResolver
    {
        /// <summary>
        /// Looks up the translated value for a given entity record and field name.
        /// Returns the English fallback when no translation entry exists in the map.
        /// </summary>
        /// <param name="map">The translation map built for the current language.</param>
        /// <param name="entityName">CRM entity logical name (e.g. "qdb_form_field").</param>
        /// <param name="recordId">GUID of the CRM record being translated.</param>
        /// <param name="fieldName">Attribute schema name (e.g. "qdb_label").</param>
        /// <param name="englishFallback">The base English value to return when no translation is found.</param>
        /// <returns>The translated string, or <paramref name="englishFallback"/> if not found.</returns>
        string Resolve(TranslationMap map, string entityName, Guid recordId, string fieldName, string englishFallback);
    }
}
