using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Removes fields and structures from a <see cref="FormDefinitionModel"/>
    /// that must not be delivered to unauthenticated portal clients.
    /// Returns a new model instance — the input is never mutated.
    /// </summary>
    public interface ISecurityStripper
    {
        /// <summary>
        /// Strips hidden fields from all sections in the form model.
        /// Fields where <see cref="FieldDefinition.IsHidden"/> is true are removed
        /// from the returned copy. Role-based filtering is NOT performed here;
        /// that is deferred to the portal's own authorisation layer.
        /// </summary>
        /// <param name="model">The fully generated form definition model to strip.</param>
        /// <returns>
        /// A deep copy of <paramref name="model"/> with hidden fields removed.
        /// </returns>
        FormDefinitionModel Strip(FormDefinitionModel model);
    }
}
