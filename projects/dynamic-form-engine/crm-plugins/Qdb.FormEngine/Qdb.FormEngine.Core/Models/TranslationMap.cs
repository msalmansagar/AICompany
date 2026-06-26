using System;
using System.Collections.Generic;

namespace Qdb.FormEngine.Core.Models
{
    /// <summary>
    /// Holds translated string values keyed by entity:recordId:fieldName.
    /// Built once per publish run from qdb_translation records and shared across generation.
    /// </summary>
    public sealed class TranslationMap
    {
        private readonly Dictionary<string, string> _entries;

        /// <summary>
        /// Initializes a new empty <see cref="TranslationMap"/>.
        /// </summary>
        public TranslationMap()
        {
            _entries = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Initializes a new <see cref="TranslationMap"/> with pre-populated entries.
        /// </summary>
        /// <param name="entries">Pre-populated translation entries.</param>
        public TranslationMap(Dictionary<string, string> entries)
        {
            if (entries == null) throw new ArgumentNullException("entries");
            _entries = new Dictionary<string, string>(entries, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Adds or overwrites a translation entry.
        /// </summary>
        /// <param name="entityName">CRM entity logical name.</param>
        /// <param name="recordId">Record GUID.</param>
        /// <param name="fieldName">Attribute schema name.</param>
        /// <param name="translatedValue">The translated string value.</param>
        public void Add(string entityName, Guid recordId, string fieldName, string translatedValue)
        {
            var key = BuildKey(entityName, recordId, fieldName);
            _entries[key] = translatedValue ?? string.Empty;
        }

        /// <summary>
        /// Tries to get a translated value for the given key components.
        /// </summary>
        /// <param name="entityName">CRM entity logical name.</param>
        /// <param name="recordId">Record GUID.</param>
        /// <param name="fieldName">Attribute schema name.</param>
        /// <param name="translatedValue">The found translated value, or null.</param>
        /// <returns>True if a translation was found; otherwise false.</returns>
        public bool TryGetValue(string entityName, Guid recordId, string fieldName, out string translatedValue)
        {
            var key = BuildKey(entityName, recordId, fieldName);
            return _entries.TryGetValue(key, out translatedValue);
        }

        /// <summary>
        /// Returns the number of translation entries stored in this map.
        /// </summary>
        public int Count => _entries.Count;

        private static string BuildKey(string entityName, Guid recordId, string fieldName)
        {
            return string.Concat(entityName, ":", recordId.ToString("D"), ":", fieldName);
        }
    }
}
