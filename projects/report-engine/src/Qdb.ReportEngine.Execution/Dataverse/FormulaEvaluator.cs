using NCalc;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Evaluates report formulas (computed columns) per row with NCalc — a closed math/logic DSL that
/// cannot reference .NET types or load assemblies (C-5). Formulas run in evaluation order and each
/// result becomes a parameter available to later formulas. A formula that fails yields a blank cell
/// rather than aborting the report. Pure — no I/O.
/// </summary>
public static class FormulaEvaluator
{
    /// <summary>The result columns contributed by <paramref name="formulas"/>, in evaluation order.</summary>
    public static IReadOnlyList<ReportResultColumn> Columns(IReadOnlyList<ReportFormula> formulas) =>
        formulas
            .Where(f => !string.IsNullOrEmpty(f.FormulaAlias))
            .Select(f => new ReportResultColumn
            {
                Alias = f.FormulaAlias!,
                Label = f.FormulaAlias,
                Attribute = null,
                DataType = f.ResultDataType
            })
            .ToList();

    /// <summary>Appends each formula's computed cell to every row.</summary>
    public static IReadOnlyList<ReportResultRow> Apply(
        IReadOnlyList<ReportFormula> formulas, IReadOnlyList<ReportResultRow> rows)
    {
        ArgumentNullException.ThrowIfNull(formulas);
        ArgumentNullException.ThrowIfNull(rows);
        if (formulas.Count == 0)
        {
            return rows;
        }

        return rows.Select(row => ApplyToRow(formulas, row)).ToList();
    }

    private static ReportResultRow ApplyToRow(IReadOnlyList<ReportFormula> formulas, ReportResultRow row)
    {
        var cells = new Dictionary<string, ReportCell>(row.Cells, StringComparer.Ordinal);
        var parameters = row.Cells.ToDictionary(c => c.Key, c => c.Value.Value, StringComparer.Ordinal);

        foreach (var formula in formulas)
        {
            if (string.IsNullOrEmpty(formula.FormulaAlias) || string.IsNullOrWhiteSpace(formula.Expression))
            {
                continue;
            }

            var cell = EvaluateOne(formula.Expression, parameters);
            cells[formula.FormulaAlias] = cell;
            parameters[formula.FormulaAlias] = cell.Value; // chainable into later formulas
        }

        return new ReportResultRow { Cells = cells };
    }

    // Bounds a pathological/malicious stored formula: a very long or deeply nested expression can
    // exhaust CPU or overflow the stack during evaluation (NCalc offers no mid-eval cancellation).
    private const int MaxExpressionLength = 1000;
    private const int MaxNestingDepth = 32;

    private static ReportCell EvaluateOne(string expression, IReadOnlyDictionary<string, object?> parameters)
    {
        if (expression.Length > MaxExpressionLength || NestingDepth(expression) > MaxNestingDepth)
        {
            return new ReportCell(null, null);
        }

        try
        {
            var evaluator = new Expression(expression, ExpressionOptions.NoCache);
            foreach (var (name, value) in parameters)
            {
                evaluator.Parameters[name] = value;
            }

            var result = evaluator.Evaluate();
            return new ReportCell(result, result?.ToString());
        }
        catch (Exception) // a bad/undefined expression blanks the cell — a formula must never break the report.
        {
            return new ReportCell(null, null);
        }
    }

    private static int NestingDepth(string expression)
    {
        int depth = 0, max = 0;
        foreach (var ch in expression)
        {
            if (ch == '(')
            {
                max = Math.Max(max, ++depth);
            }
            else if (ch == ')')
            {
                depth--;
            }
        }

        return max;
    }
}
