using System.Collections.Generic;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Collects the schema names that one field's configuration points at another
    /// field's value — utilization-bar sources, data-bound label sources, and
    /// grid depends-on filters.
    /// </summary>
    public interface IFieldReferenceCollector
    {
        /// <summary>
        /// Returns every schema name referenced by any field in the model.
        /// Comparison is case-insensitive so callers can match schema names directly.
        /// </summary>
        /// <param name="model">The generated form definition to scan.</param>
        /// <returns>Referenced schema names; empty when the model has no fields.</returns>
        ISet<string> CollectReferencedSchemaNames(FormDefinitionModel model);
    }
}
