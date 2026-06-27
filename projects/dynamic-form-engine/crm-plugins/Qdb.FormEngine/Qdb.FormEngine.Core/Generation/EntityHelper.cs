using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Provides safe attribute-reading helpers for CRM <see cref="Entity"/> instances.
    /// Centralises null-guarded access patterns used throughout the generation pipeline.
    /// </summary>
    internal static class EntityHelper
    {
        /// <summary>
        /// Returns the integer value of an OptionSetValue attribute, or null when absent.
        /// </summary>
        /// <param name="entity">The CRM entity to read from.</param>
        /// <param name="attributeName">The attribute schema name.</param>
        /// <returns>The option set integer value or null.</returns>
        public static int? GetOptionSetValue(Entity entity, string attributeName)
        {
            if (!entity.Contains(attributeName)) return null;
            var optionSet = entity.GetAttributeValue<OptionSetValue>(attributeName);
            return optionSet?.Value;
        }

        /// <summary>
        /// Returns the GUID from an EntityReference attribute, or <see cref="Guid.Empty"/> when absent.
        /// </summary>
        /// <param name="entity">The CRM entity to read from.</param>
        /// <param name="attributeName">The attribute schema name (lookup or aliased value).</param>
        /// <returns>The referenced record GUID or <see cref="Guid.Empty"/>.</returns>
        public static Guid GetLookupId(Entity entity, string attributeName)
        {
            if (!entity.Contains(attributeName)) return Guid.Empty;
            var reference = entity.GetAttributeValue<EntityReference>(attributeName);
            return reference?.Id ?? Guid.Empty;
        }

        /// <summary>
        /// Returns the GUID from an EntityReference attribute, or null when absent.
        /// </summary>
        /// <param name="entity">The CRM entity to read from.</param>
        /// <param name="attributeName">The attribute schema name.</param>
        /// <returns>The referenced record GUID or null.</returns>
        public static Guid? GetNullableLookupId(Entity entity, string attributeName)
        {
            if (!entity.Contains(attributeName)) return null;
            var reference = entity.GetAttributeValue<EntityReference>(attributeName);
            return reference?.Id;
        }

        /// <summary>
        /// Returns a boolean attribute value, defaulting to true when the attribute is absent.
        /// Mirrors the live contract's "qdb_is_visible ?? true" semantics, since
        /// <see cref="Entity.GetAttributeValue{T}"/> would otherwise default a missing bool to false.
        /// </summary>
        /// <param name="entity">The CRM entity to read from.</param>
        /// <param name="attributeName">The boolean attribute name.</param>
        /// <returns>The stored value, or true when absent.</returns>
        public static bool GetBoolOrTrue(Entity entity, string attributeName)
        {
            return !entity.Contains(attributeName) || entity.GetAttributeValue<bool>(attributeName);
        }

        /// <summary>
        /// Returns the integer values of a multi-select option set attribute,
        /// or an empty list when the attribute is absent or null.
        /// </summary>
        /// <param name="entity">The CRM entity to read from.</param>
        /// <param name="attributeName">The multi-select picklist attribute name.</param>
        /// <returns>The selected option values, or an empty list.</returns>
        public static List<int> GetMultiSelectValues(Entity entity, string attributeName)
        {
            if (!entity.Contains(attributeName)) return new List<int>();
            var collection = entity.GetAttributeValue<OptionSetValueCollection>(attributeName);
            if (collection == null) return new List<int>();
            return collection.Select(option => option.Value).ToList();
        }
    }
}
