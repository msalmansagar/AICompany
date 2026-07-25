using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.FormEngine.Core.Models;

namespace Qdb.FormEngine.Core.Generation
{
    /// <summary>
    /// Scans a <see cref="FormDefinitionModel"/> for cross-field references — a field
    /// whose configuration reads another field's value at runtime. The published JSON
    /// must keep those source fields even when they are hidden, otherwise the reading
    /// field renders against a value that no longer exists.
    /// </summary>
    public sealed class FieldReferenceCollector : IFieldReferenceCollector
    {
        private static readonly char[] SchemaNameSeparator = { ',' };

        /// <inheritdoc />
        public ISet<string> CollectReferencedSchemaNames(FormDefinitionModel model)
        {
            var referencedSchemaNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (model?.Tabs == null) return referencedSchemaNames;

            foreach (var field in EnumerateFields(model))
            {
                AddReferencesOfField(field, referencedSchemaNames);
            }

            return referencedSchemaNames;
        }

        private static IEnumerable<FieldDefinition> EnumerateFields(FormDefinitionModel model)
        {
            return model.Tabs
                .Where(tab => tab?.Sections != null)
                .SelectMany(tab => tab.Sections)
                .Where(section => section?.Fields != null)
                .SelectMany(section => section.Fields)
                .Where(field => field != null);
        }

        private static void AddReferencesOfField(FieldDefinition field, ISet<string> referencedSchemaNames)
        {
            // DFE-NUMBAR: the bar reads its value and its maximum from other fields.
            AddSchemaName(field.BarValueFieldSchemaName, referencedSchemaNames);
            AddSchemaName(field.BarMaxFieldSchemaName, referencedSchemaNames);
            // DFE-FBE-001: a data-bound Label echoes another field's value.
            AddSchemaName(field.SourceFieldSchemaName, referencedSchemaNames);
            // DFE-GRIDSRC-001: comma-separated schema names feeding the grid filter template.
            AddSchemaNameList(field.GridConfig?.DependsOnFieldId, referencedSchemaNames);
        }

        private static void AddSchemaName(string schemaName, ISet<string> referencedSchemaNames)
        {
            if (string.IsNullOrWhiteSpace(schemaName)) return;
            referencedSchemaNames.Add(schemaName.Trim());
        }

        private static void AddSchemaNameList(string schemaNameList, ISet<string> referencedSchemaNames)
        {
            if (string.IsNullOrWhiteSpace(schemaNameList)) return;

            foreach (var schemaName in schemaNameList.Split(SchemaNameSeparator, StringSplitOptions.RemoveEmptyEntries))
            {
                AddSchemaName(schemaName, referencedSchemaNames);
            }
        }
    }
}
