using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class FormulaEvaluatorTests
{
    [Fact]
    public void Apply_ComputesArithmeticFormulaPerRow()
    {
        var formulas = new[] { Formula("total", "qty * price", order: 1) };
        var rows = new[] { Row(("qty", 3L), ("price", 10L)) };

        var result = FormulaEvaluator.Apply(formulas, rows);

        Assert.Equal(30, Convert.ToInt32(result[0].Cells["total"].Value));
    }

    [Fact]
    public void Apply_LaterFormulaCanReferenceEarlierResult()
    {
        var formulas = new[]
        {
            Formula("net", "amount", order: 1),
            Formula("withTax", "net * 1.05", order: 2)
        };
        var rows = new[] { Row(("amount", 100m)) };

        var result = FormulaEvaluator.Apply(formulas, rows);

        Assert.Equal(105m, Convert.ToDecimal(result[0].Cells["withTax"].Value));
    }

    [Fact]
    public void Apply_ConditionalFunctionIsSupported()
    {
        var formulas = new[] { Formula("band", "if(score >= 50, 'pass', 'fail')", order: 1) };

        var result = FormulaEvaluator.Apply(formulas, [Row(("score", 70L))]);

        Assert.Equal("pass", result[0].Cells["band"].Value);
    }

    [Fact]
    public void Apply_BadExpression_BlanksCellWithoutThrowing()
    {
        var formulas = new[] { Formula("bad", "this is not valid @@", order: 1) };

        var result = FormulaEvaluator.Apply(formulas, [Row(("x", 1L))]);

        Assert.Null(result[0].Cells["bad"].Value);
        Assert.Null(result[0].Cells["bad"].Text);
    }

    [Fact]
    public void Columns_AppendsFormulaColumnsInOrder()
    {
        var formulas = new[] { Formula("total", "a+b", order: 1), Formula("half", "total/2", order: 2) };

        var columns = FormulaEvaluator.Columns(formulas);

        Assert.Equal(["total", "half"], columns.Select(c => c.Alias));
    }

    private static ReportFormula Formula(string alias, string expression, int order) =>
        new() { Id = Guid.NewGuid(), FormulaAlias = alias, Expression = expression, EvaluationOrder = order };

    private static ReportResultRow Row(params (string Alias, object? Value)[] cells) => new()
    {
        Cells = cells.ToDictionary(c => c.Alias, c => new ReportCell(c.Value, c.Value?.ToString()), StringComparer.Ordinal)
    };
}
