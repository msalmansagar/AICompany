using System;
using System.Collections.Generic;
using System.Linq;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Metadata;
using EDP.RuleRuntime.Operators;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Compiler
{
    /// <summary>
    /// Platform-owned validation (the runtime cannot rely on GoRules/WASM). Validates
    /// metadata bindings, operators, and symbol references, returning Error/Warning
    /// diagnostics. Specification-style: each rule is an independent check.
    /// </summary>
    public sealed class RuleValidator
    {
        private readonly IMetadataResolver _metadata;

        public RuleValidator(IMetadataResolver metadata) => _metadata = metadata;

        public IReadOnlyList<RuleDiagnostic> Validate(PcrmDocument doc)
        {
            var diagnostics = new List<RuleDiagnostic>();
            var symbols = new HashSet<string>(
                doc.Inputs.Select(i => i.Name).Concat(doc.Variables.Select(v => v.Name)),
                StringComparer.OrdinalIgnoreCase);

            ValidateBindings(doc, diagnostics);

            if (doc.Logic.Type.Equals("decisionTable", StringComparison.OrdinalIgnoreCase))
                ValidateTable(doc.Logic, symbols, diagnostics);
            else
                ValidateConditionSet(doc.Logic, symbols, diagnostics);

            return diagnostics;
        }

        private void ValidateBindings(PcrmDocument doc, List<RuleDiagnostic> diagnostics)
        {
            if (string.IsNullOrWhiteSpace(doc.TargetEntity)) return;
            if (!_metadata.EntityExists(doc.TargetEntity))
            {
                diagnostics.Add(new RuleDiagnostic("EDP001", $"Target entity '{doc.TargetEntity}' not found in metadata.", RuleErrorSeverity.Warning));
                return;
            }
            foreach (var input in doc.Inputs.Where(i => !string.IsNullOrWhiteSpace(i.Binding) || i.Aggregate != null))
            {
                if (input.Aggregate != null)
                    ValidateAggregate(input, diagnostics);
                else if (input.Via != null && !string.IsNullOrWhiteSpace(input.Via.Relationship))
                    ValidateRelatedBinding(doc.TargetEntity, input, diagnostics);
                else if (!_metadata.TryGetAttribute(doc.TargetEntity, input.Binding!, out _))
                    diagnostics.Add(new RuleDiagnostic("EDP002", $"Field '{input.Binding}' not found on '{doc.TargetEntity}'.", RuleErrorSeverity.Error, input.Name));
            }
        }

        /// <summary>A 1:N aggregate input folds a child collection — validate against the child entity.</summary>
        private void ValidateAggregate(PcrmInput input, List<RuleDiagnostic> diagnostics)
        {
            var agg = input.Aggregate!;
            if (string.IsNullOrWhiteSpace(agg.ChildEntity) || !_metadata.EntityExists(agg.ChildEntity))
            {
                diagnostics.Add(new RuleDiagnostic("EDP008", $"Child entity '{agg.ChildEntity}' not found in metadata.", RuleErrorSeverity.Warning, input.Name));
                return;
            }
            if (string.IsNullOrWhiteSpace(agg.ChildLookup) || !_metadata.TryGetAttribute(agg.ChildEntity, agg.ChildLookup, out _))
                diagnostics.Add(new RuleDiagnostic("EDP009", $"Lookup '{agg.ChildLookup}' not found on child entity '{agg.ChildEntity}'.", RuleErrorSeverity.Error, input.Name));

            if (!string.Equals(agg.Function, "Count", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(input.Binding))
                    diagnostics.Add(new RuleDiagnostic("EDP012", $"Aggregate '{agg.Function}' needs a child field to aggregate.", RuleErrorSeverity.Error, input.Name));
                else if (!_metadata.TryGetAttribute(agg.ChildEntity, input.Binding!, out _))
                    diagnostics.Add(new RuleDiagnostic("EDP012", $"Field '{input.Binding}' not found on child entity '{agg.ChildEntity}'.", RuleErrorSeverity.Error, input.Name));
            }

            if (agg.Filter != null && !string.IsNullOrWhiteSpace(agg.Filter.Field) && !_metadata.TryGetAttribute(agg.ChildEntity, agg.Filter.Field, out _))
                diagnostics.Add(new RuleDiagnostic("EDP013", $"Filter field '{agg.Filter.Field}' not found on child entity '{agg.ChildEntity}'.", RuleErrorSeverity.Error, input.Name));
        }

        /// <summary>An N:1 input binds to a field on the related entity, reached by a lookup on the anchor.</summary>
        private void ValidateRelatedBinding(string anchor, PcrmInput input, List<RuleDiagnostic> diagnostics)
        {
            var via = input.Via!;
            if (!_metadata.TryGetAttribute(anchor, via.Relationship, out _))
                diagnostics.Add(new RuleDiagnostic("EDP005", $"Lookup '{via.Relationship}' not found on '{anchor}'.", RuleErrorSeverity.Error, input.Name));

            if (string.IsNullOrWhiteSpace(via.Entity) || !_metadata.EntityExists(via.Entity))
                diagnostics.Add(new RuleDiagnostic("EDP006", $"Related entity '{via.Entity}' not found in metadata.", RuleErrorSeverity.Warning, input.Name));
            else if (!_metadata.TryGetAttribute(via.Entity, input.Binding!, out _))
                diagnostics.Add(new RuleDiagnostic("EDP007", $"Field '{input.Binding}' not found on related entity '{via.Entity}'.", RuleErrorSeverity.Error, input.Name));
        }

        private void ValidateConditionSet(PcrmLogic logic, HashSet<string> symbols, List<RuleDiagnostic> diagnostics)
        {
            if (logic.Rules.Count == 0 && logic.Otherwise == null)
                diagnostics.Add(new RuleDiagnostic("EDP010", "Condition set has no rules and no otherwise branch.", RuleErrorSeverity.Warning));

            foreach (var rule in logic.Rules)
                ValidateGroup(rule.When, symbols, diagnostics);
        }

        private void ValidateGroup(PcrmGroup group, HashSet<string> symbols, List<RuleDiagnostic> diagnostics)
        {
            foreach (var c in group.Conditions)
            {
                if (!OperatorEvaluator.IsKnown(c.Operator))
                    diagnostics.Add(new RuleDiagnostic("EDP003", $"Unknown operator '{c.Operator}'.", RuleErrorSeverity.Error, c.Field));
                if (!string.IsNullOrWhiteSpace(c.Field) && !symbols.Contains(c.Field))
                    diagnostics.Add(new RuleDiagnostic("EDP004", $"Condition references undeclared symbol '{c.Field}'.", RuleErrorSeverity.Error, c.Field));
            }
            foreach (var nested in group.Groups)
                ValidateGroup(nested, symbols, diagnostics);
        }

        private void ValidateTable(PcrmLogic logic, HashSet<string> symbols, List<RuleDiagnostic> diagnostics)
        {
            if (logic.Rows.Count == 0 && logic.DefaultRow == null)
                diagnostics.Add(new RuleDiagnostic("EDP011", "Decision table has no rows and no default row.", RuleErrorSeverity.Warning));

            foreach (var input in logic.TableInputs.Where(ti => !symbols.Contains(ti.Field)))
                diagnostics.Add(new RuleDiagnostic("EDP004", $"Table input references undeclared symbol '{input.Field}'.", RuleErrorSeverity.Error, input.Field));

            foreach (var row in logic.Rows)
                foreach (var cell in row.Cells.Where(cell => !cell.Any && !OperatorEvaluator.IsKnown(cell.Operator)))
                    diagnostics.Add(new RuleDiagnostic("EDP003", $"Unknown operator '{cell.Operator}' in table cell.", RuleErrorSeverity.Error));
        }
    }
}
