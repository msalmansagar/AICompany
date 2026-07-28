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

            var fields = EnumerateFields(model).ToList();

            // A rule's target is stored as a record id, so resolving it back to a schema name
            // needs the whole field set first.
            var schemaNameById = new Dictionary<Guid, string>();
            foreach (var field in fields)
            {
                if (!string.IsNullOrWhiteSpace(field.SchemaName)) schemaNameById[field.Id] = field.SchemaName;
            }

            foreach (var field in fields)
            {
                AddReferencesOfField(field, referencedSchemaNames);
                AddRuleReferences(field, schemaNameById, referencedSchemaNames);
            }

            return referencedSchemaNames;
        }

        /// <summary>
        /// Fields a business rule depends on. Both directions matter:
        ///
        ///  · the fields its CONDITIONS watch — a rule hangs off its trigger field, so if that
        ///    field is stripped the rule goes with it and can never fire;
        ///  · the field it TARGETS — "hidden by default, shown by a rule" is a normal pattern,
        ///    and stripping the target makes the show action unreachable.
        /// </summary>
        private static void AddRuleReferences(
            FieldDefinition field,
            IDictionary<Guid, string> schemaNameById,
            ISet<string> referencedSchemaNames)
        {
            if (field.BusinessRules == null) return;

            foreach (var rule in field.BusinessRules)
            {
                if (rule == null) continue;

                if (rule.Conditions != null)
                {
                    foreach (var condition in rule.Conditions)
                    {
                        // Conditions carry schema names by the time the model is built.
                        if (condition != null) AddSchemaName(condition.FieldId, referencedSchemaNames);
                    }
                }

                string targetSchemaName;
                if (rule.TargetFieldId.HasValue
                    && schemaNameById.TryGetValue(rule.TargetFieldId.Value, out targetSchemaName))
                {
                    AddSchemaName(targetSchemaName, referencedSchemaNames);
                }
            }
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
