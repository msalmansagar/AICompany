using System.Xml.Linq;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Builds the executable FetchXML for a report from its columns, filters, and row limit, plus the
/// ordered output columns used to shape results. Runtime-prompt filters are resolved from the
/// request's parameter values (falling back to a parameter's default). Pure — testable without CRM.
/// </summary>
public static class ReportQueryBuilder
{
    private const int DefaultRowLimit = 5000;

    // qdb_operator option-set labels → FetchXML operators.
    private static readonly IReadOnlyDictionary<string, string> Operators =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Equals"] = "eq", ["NotEquals"] = "ne", ["GreaterThan"] = "gt", ["LessThan"] = "lt",
            ["Contains"] = "like", ["BeginsWith"] = "like", ["EndsWith"] = "like",
            ["Between"] = "between", ["In"] = "in", ["NotIn"] = "not-in",
            ["IsNull"] = "null", ["IsNotNull"] = "not-null",
            ["LastXDays"] = "last-x-days", ["ThisMonth"] = "this-month", ["ThisYear"] = "this-year"
        };

    private static readonly HashSet<string> ValuelessOperators = new(StringComparer.Ordinal)
        { "null", "not-null", "this-month", "this-year" };

    private static readonly HashSet<string> MultiValueOperators = new(StringComparer.Ordinal)
        { "between", "in", "not-in" };

    // qdb_aggregatefunction option-set labels → FetchXML aggregate operators ("None" = not a measure).
    private static readonly IReadOnlyDictionary<string, string> Aggregates =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Sum"] = "sum", ["Count"] = "count", ["Avg"] = "avg", ["Min"] = "min", ["Max"] = "max"
        };

    /// <summary>Builds the query for <paramref name="definition"/> under <paramref name="request"/>.</summary>
    public static ReportQuery Build(ReportDefinition definition, ReportExecutionRequest request)
    {
        if (definition is null) throw new ArgumentNullException(nameof(definition));
        if (request is null) throw new ArgumentNullException(nameof(request));

        var rootEntity = definition.MainEntityLogicalName ?? FirstMappingEntity(definition)
            ?? throw new InvalidOperationException($"Report {definition.Id} has no entity to query.");
        var columns = ColumnsFor(definition, rootEntity);
        var isAggregate = columns.Any(IsMeasure);

        var entity = new XElement("entity", new XAttribute("name", rootEntity));
        if (isAggregate)
        {
            AddAggregateProjection(entity, columns);
        }
        else
        {
            AddProjection(entity, columns);
        }

        AddFilters(entity, definition, request.ParameterValues);
        if (isAggregate)
        {
            AddGroupOrders(entity, columns);
        }

        var rowLimit = request.RowLimitOverride ?? definition.RowLimit ?? DefaultRowLimit;
        // Aggregate fetch does not accept a top attribute; the projection query caps rows with top.
        var fetch = isAggregate
            ? new XElement("fetch", new XAttribute("aggregate", "true"), entity)
            : new XElement("fetch", new XAttribute("top", rowLimit), entity);

        return new ReportQuery(fetch.ToString(SaveOptions.DisableFormatting), rootEntity, ToResultColumns(columns), rowLimit, isAggregate);
    }

    private static void AddProjection(XElement entity, IReadOnlyList<ReportColumn> columns)
    {
        if (columns.Count == 0)
        {
            entity.Add(new XElement("all-attributes"));
            return;
        }

        foreach (var column in columns)
        {
            entity.Add(new XElement("attribute",
                new XAttribute("name", column.ColumnLogicalName!),
                new XAttribute("alias", Alias(column))));
        }
    }

    // Aggregate mode: measures carry an aggregate operator; every other column becomes a group-by.
    private static void AddAggregateProjection(XElement entity, IReadOnlyList<ReportColumn> columns)
    {
        foreach (var column in columns)
        {
            var attribute = new XElement("attribute",
                new XAttribute("name", column.ColumnLogicalName!),
                new XAttribute("alias", Alias(column)));
            if (IsMeasure(column))
            {
                attribute.Add(new XAttribute("aggregate", Aggregates[column.AggregateFunction!.Label!]));
            }
            else
            {
                attribute.Add(new XAttribute("groupby", "true"));
            }

            entity.Add(attribute);
        }
    }

    private static void AddGroupOrders(XElement entity, IReadOnlyList<ReportColumn> columns)
    {
        var groupColumns = columns.Where(c => !IsMeasure(c)).OrderBy(c => c.GroupOrder);
        foreach (var column in groupColumns)
        {
            entity.Add(new XElement("order", new XAttribute("alias", Alias(column))));
        }
    }

    private static bool IsMeasure(ReportColumn column) =>
        column.AggregateFunction?.Label is { } label && Aggregates.ContainsKey(label);

    private static void AddFilters(XElement entity, ReportDefinition definition, IReadOnlyDictionary<string, string?> parameters)
    {
        var conditions = definition.Filters
            .OrderBy(f => f.Sequence)
            .Select(f => BuildCondition(f, definition, parameters))
            .Where(c => c is not null)
            .ToList();
        if (conditions.Count == 0)
        {
            return;
        }

        var groupType = string.Equals(definition.Filters[0].GroupOperator?.Label, "Or", StringComparison.OrdinalIgnoreCase) ? "or" : "and";
        var filter = new XElement("filter", new XAttribute("type", groupType));
        filter.Add(conditions);
        entity.Add(filter);
    }

    private static XElement? BuildCondition(ReportFilter filter, ReportDefinition definition, IReadOnlyDictionary<string, string?> parameters)
    {
        if (string.IsNullOrEmpty(filter.FieldAlias))
        {
            return null;
        }

        // TryGetValue rather than GetValueOrDefault: this file is also compiled into the net462
        // plugin (ADR-RPT-011), where the newer dictionary extension does not exist.
        var op = Operators.TryGetValue(filter.Operator?.Label ?? "Equals", out var mapped) ? mapped : "eq";
        var condition = new XElement("condition",
            new XAttribute("attribute", filter.FieldAlias),
            new XAttribute("operator", op));

        if (ValuelessOperators.Contains(op))
        {
            return condition;
        }

        var value = ResolveValue(filter, definition, parameters);
        if (string.IsNullOrEmpty(value))
        {
            return null; // an unfilled prompt drops the condition rather than filtering on nothing.
        }

        if (MultiValueOperators.Contains(op))
        {
            // Trimmed explicitly — StringSplitOptions.TrimEntries does not exist on net462, which
            // this file also targets via the plugin.
            foreach (var part in value.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
            {
                condition.Add(new XElement("value", part.Trim()));
            }

            return condition.Elements("value").Any() ? condition : null;
        }

        condition.SetAttributeValue("value", ApplyWildcards(filter.Operator?.Label, value));
        return condition;
    }

    private static string ResolveValue(ReportFilter filter, ReportDefinition definition, IReadOnlyDictionary<string, string?> parameters)
    {
        if (!filter.IsRuntimePrompt)
        {
            return filter.Value ?? string.Empty;
        }

        var parameterName = filter.Value ?? string.Empty;
        if (parameters.TryGetValue(parameterName, out var supplied) && !string.IsNullOrEmpty(supplied))
        {
            return supplied;
        }

        var parameter = definition.Parameters.FirstOrDefault(p =>
            string.Equals(p.ParameterName, parameterName, StringComparison.OrdinalIgnoreCase));
        return parameter?.DefaultValue ?? string.Empty;
    }

    private static string ApplyWildcards(string? operatorLabel, string value) => operatorLabel switch
    {
        "Contains" => $"%{value}%",
        "BeginsWith" => $"{value}%",
        "EndsWith" => $"%{value}",
        _ => value
    };

    private static IReadOnlyList<ReportColumn> ColumnsFor(ReportDefinition definition, string rootEntity)
    {
        var forRoot = definition.DataSources
            .SelectMany(d => d.EntityMappings)
            .Where(m => string.Equals(m.EntityLogicalName, rootEntity, StringComparison.OrdinalIgnoreCase))
            .SelectMany(m => m.Columns)
            .ToList();
        var columns = forRoot.Count > 0
            ? forRoot
            : definition.DataSources.SelectMany(d => d.EntityMappings).SelectMany(m => m.Columns).ToList();

        return columns
            .Where(c => !string.IsNullOrEmpty(c.ColumnLogicalName))
            .OrderBy(c => c.SortOrder)
            .ToList();
    }

    private static IReadOnlyList<ReportResultColumn> ToResultColumns(IReadOnlyList<ReportColumn> columns) =>
        columns.Select(c => new ReportResultColumn
        {
            Alias = Alias(c),
            Label = c.OutputAlias ?? c.ColumnLogicalName,
            Attribute = c.ColumnLogicalName,
            DataType = c.DataType,
            IsVisible = c.IsVisible
        }).ToList();

    private static string Alias(ReportColumn column) =>
        !string.IsNullOrEmpty(column.OutputAlias) ? column.OutputAlias : column.ColumnLogicalName!;

    private static string? FirstMappingEntity(ReportDefinition definition) =>
        definition.DataSources.SelectMany(d => d.EntityMappings)
            .Select(m => m.EntityLogicalName)
            .FirstOrDefault(e => !string.IsNullOrEmpty(e));
}

/// <summary>The built query: FetchXML, the root entity, the output columns, the row limit, and whether it aggregates.</summary>
public sealed record ReportQuery(
    string FetchXml, string RootEntity, IReadOnlyList<ReportResultColumn> Columns, int RowLimit, bool IsAggregate = false);
