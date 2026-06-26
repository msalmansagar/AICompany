namespace Qdb.FormEngine.Core.Abstractions
{
    /// <summary>
    /// Reads all CRM metadata required to generate a form definition
    /// for a given form code and language.
    /// </summary>
    public interface IMetadataReader
    {
        /// <summary>
        /// Fetches the complete raw data for a form definition identified by its unique code.
        /// </summary>
        /// <param name="formCode">The qdb_form_code value identifying the form.</param>
        /// <returns>
        /// A populated <see cref="FormRawData"/> instance containing all entity records
        /// required for generation. The <see cref="FormRawData.TranslationMap"/> is populated
        /// separately via <see cref="ReadTranslationMap"/> to support per-language runs.
        /// </returns>
        FormRawData ReadFormRawData(string formCode);

        /// <summary>
        /// Builds a <see cref="Qdb.FormEngine.Core.Models.TranslationMap"/> for the given
        /// record IDs and language code by querying qdb_translation.
        /// </summary>
        /// <param name="recordIds">All record GUIDs that need translations.</param>
        /// <param name="languageCode">The two-letter language code (e.g. "en", "ar").</param>
        /// <returns>A populated translation map for this language.</returns>
        Qdb.FormEngine.Core.Models.TranslationMap ReadTranslationMap(System.Collections.Generic.List<System.Guid> recordIds, string languageCode);
    }
}
