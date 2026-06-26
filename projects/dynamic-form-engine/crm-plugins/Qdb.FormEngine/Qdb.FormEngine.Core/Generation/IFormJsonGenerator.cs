using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Transforms raw CRM entity data into a fully hydrated
    /// <see cref="FormDefinitionModel"/> for a specific language variant.
    /// </summary>
    public interface IFormJsonGenerator
    {
        /// <summary>
        /// Generates a complete form definition model from the supplied raw CRM data.
        /// Picklist values are mapped to string codes, translations are applied,
        /// and all nested structures (tabs, sections, fields, rules) are assembled.
        /// </summary>
        /// <param name="rawData">
        /// All raw entity records and the translation map for the target language,
        /// as read by <see cref="IMetadataReader"/>.
        /// </param>
        /// <param name="languageCode">
        /// The two-letter language code being generated (e.g. "en", "ar").
        /// Used for translation fallback decisions.
        /// </param>
        /// <returns>A fully populated <see cref="FormDefinitionModel"/>.</returns>
        FormDefinitionModel Generate(FormRawData rawData, string languageCode);
    }
}
