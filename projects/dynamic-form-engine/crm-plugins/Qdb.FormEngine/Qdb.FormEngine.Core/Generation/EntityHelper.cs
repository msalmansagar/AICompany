using System;
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
    }
}
