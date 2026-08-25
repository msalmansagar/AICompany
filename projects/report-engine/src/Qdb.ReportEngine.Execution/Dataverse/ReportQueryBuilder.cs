using System;
using System.Text.RegularExpressions;
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

    /// <summary>
    /// The largest value FetchXML accepts for <c>top</c>. Dataverse rejects anything above this with
    /// "Parameter name: top", which failed the whole report — and the designer's own default row
    /// limit is 50,000, so every report built from the generated query hit it.
    /// </summary>
    private const int MaxFetchTop = 5000;

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
        var joined = JoinedMappings(definition, rootEntity);
        var columns = ColumnsFor(definition, rootEntity, joined);
        var joinedColumns = joined.SelectMany(m => VisibleColumns(m.Columns)).ToList();
        var isAggregate = columns.Concat(joinedColumns).Any(IsMeasure);

        var entity = new XElement("entity", new XAttribute("name", rootEntity));
        if (isAggregate)
        {
            AddAggregateProjection(entity, columns);
        }
        else
        {
            AddProjection(entity, columns);
        }

        // Related entities become link-entity elements. Their attributes carry explicit aliases, so a
        // joined column is read by the same alias as any other and the row shaper needs no special case.
        foreach (var mapping in joined)
        {
            entity.Add(BuildLinkEntity(mapping, isAggregate));
        }

        AddFilters(entity, definition, request.ParameterValues);
        if (isAggregate)
        {
            AddGroupOrders(entity, columns);
        }

        // Capped, not passed through: a limit above what FetchXML allows used to fail the report
        // rather than return the rows it could. The capped value is what travels on, so Truncated
        // reflects the limit actually applied instead of one that was never used.
        var requested = request.RowLimitOverride ?? definition.RowLimit ?? DefaultRowLimit;
        var rowLimit = Math.Min(Math.Max(requested, 1), MaxFetchTop);
        // Aggregate fetch does not accept a top attribute; the projection query caps rows with top.
        var fetch = isAggregate
            ? new XElement("fetch", new XAttribute("aggregate", "true"), entity)
            : new XElement("fetch", new XAttribute("top", rowLimit), entity);

        var resultColumns = ToResultColumns(columns).Concat(ToResultColumns(joinedColumns)).ToList();
        return new ReportQuery(fetch.ToString(SaveOptions.DisableFormatting), rootEntity, resultColumns, rowLimit, isAggregate);
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

    private static IReadOnlyList<ReportColumn> ColumnsFor(
        ReportDefinition definition, string rootEntity, IReadOnlyList<ReportEntityMapping> joined)
    {
        var forRoot = RootMappings(definition)
            .Where(m => string.Equals(m.EntityLogicalName, rootEntity, StringComparison.OrdinalIgnoreCase))
            .SelectMany(m => m.Columns)
            .ToList();

        // The fallback exists for definitions whose main entity does not match any mapping. It must not
        // sweep up joined columns, which belong inside their own link-entity.
        var columns = forRoot.Count > 0 || joined.Count > 0
            ? forRoot
            : RootMappings(definition).SelectMany(m => m.Columns).ToList();

        return VisibleColumns(columns);
    }

    private static IReadOnlyList<ReportColumn> VisibleColumns(IEnumerable<ReportColumn> columns) =>
        columns.Where(c => !string.IsNullOrEmpty(c.ColumnLogicalName)).OrderBy(c => c.SortOrder).ToList();

    /// <summary>
    /// Mappings for entities other than the root that declare how they link to it. A mapping without a
    /// usable join expression is skipped rather than guessed at — an invented link would silently
    /// return the wrong rows, which is worse than omitting the columns.
    /// </summary>
    private static IReadOnlyList<ReportEntityMapping> JoinedMappings(ReportDefinition definition, string rootEntity) =>
        RootMappings(definition)
            .Where(m => !string.IsNullOrEmpty(m.EntityLogicalName)
                && !string.Equals(m.EntityLogicalName, rootEntity, StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrEmpty(ReadJoinKey(m.JoinExpressionJson, "from"))
                && !string.IsNullOrEmpty(ReadJoinKey(m.JoinExpressionJson, "to")))
            .OrderBy(m => m.Depth)
            .ToList();

    private static XElement BuildLinkEntity(ReportEntityMapping mapping, bool isAggregate)
    {
        var link = new XElement("link-entity",
            new XAttribute("name", mapping.EntityLogicalName!),
            new XAttribute("from", ReadJoinKey(mapping.JoinExpressionJson, "from")!),
            new XAttribute("to", ReadJoinKey(mapping.JoinExpressionJson, "to")!),
            new XAttribute("link-type", LinkType(mapping.JoinType?.Label)));

        if (!string.IsNullOrEmpty(mapping.EntityAlias))
        {
            link.Add(new XAttribute("alias", mapping.EntityAlias!));
        }

        var columns = VisibleColumns(mapping.Columns);
        if (isAggregate)
        {
            AddAggregateProjection(link, columns);
        }
        else
        {
            AddProjection(link, columns);
        }

        return link;
    }

    /// <summary>
    /// FetchXML offers only inner and outer, so anything that is not an inner join becomes outer —
    /// keeping the parent rows is the safer reading of a user asking for a left or right join.
    /// </summary>
    private static string LinkType(string? joinType) =>
        string.Equals(joinType, "Inner", StringComparison.OrdinalIgnoreCase) ? "inner" : "outer";

    /// <summary>
    /// Reads one key from the join expression. Deliberately a regular expression rather than a JSON
    /// parser: this file is also compiled into the net462 plugin, which has no System.Text.Json, and
    /// the document is our own fixed <c>{"from":"…","to":"…"}</c> shape.
    /// </summary>
    private static string? ReadJoinKey(string? joinExpressionJson, string key)
    {
        if (string.IsNullOrEmpty(joinExpressionJson))
        {
            return null;
        }

        var match = Regex.Match(joinExpressionJson, "\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
        return match.Success ? match.Groups[1].Value : null;
    }

    private static IReadOnlyList<ReportResultColumn> ToResultColumns(IReadOnlyList<ReportColumn> columns) =>
        columns.Select(c => new ReportResultColumn
        {
            Alias = Alias(c),
            Label = c.DisplayName ?? c.OutputAlias ?? c.ColumnLogicalName,
            Attribute = c.ColumnLogicalName,
            DataType = c.DataType,
            IsVisible = c.IsVisible
        }).ToList();

    private static string Alias(ReportColumn column) =>
        !string.IsNullOrEmpty(column.OutputAlias) ? column.OutputAlias : column.ColumnLogicalName!;

    private static string? FirstMappingEntity(ReportDefinition definition) =>
        RootMappings(definition)
            .Select(m => m.EntityLogicalName)
            .FirstOrDefault(e => !string.IsNullOrEmpty(e));

    /// <summary>
    /// The mappings that belong in the root query: everything except a standalone source's
    /// (MDS-FR-004, ADR-RPT-012 §3).
    ///
    /// A standalone dataset runs its own query and renders as its own block. Leaving its mappings in
    /// here as well would link its entity into the root query too, so the same rows would appear in
    /// the root table and in the block — which reads as a join gone wrong rather than as a
    /// configuration mistake.
    ///
    /// A source with no composition is joined, which is what the engine has always done, so every
    /// report saved before MDS-FR-002 builds the identical query.
    /// </summary>
    private static IEnumerable<ReportEntityMapping> RootMappings(ReportDefinition definition) =>
        definition.DataSources
            .Where(d => d.IsEnabled && !DatasetComposition.IsStandalone(d))
            .SelectMany(d => d.EntityMappings);
}

/// <summary>The built query: FetchXML, the root entity, the output columns, the row limit, and whether it aggregates.</summary>
public sealed record ReportQuery(
    string FetchXml, string RootEntity, IReadOnlyList<ReportResultColumn> Columns, int RowLimit, bool IsAggregate = false);
