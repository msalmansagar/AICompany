using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Plans a drilldown: given a parent report, a relationship, and a parent key value, synthesizes a
/// child <see cref="ReportDefinition"/> that queries the related entity (identified by the
/// relationship's child alias) filtered to the parent key. Reuses the normal query pipeline. Pure.
/// </summary>
public static class DrilldownPlanner
{
    /// <summary>Builds the child-query definition for <paramref name="relationshipId"/>, or a failure.</summary>
    public static Result<ReportDefinition> BuildChildDefinition(
        ReportDefinition definition, Guid relationshipId, string parentKey)
    {
        ArgumentNullException.ThrowIfNull(definition);
        ArgumentException.ThrowIfNullOrEmpty(parentKey);

        var relationship = definition.Relationships.FirstOrDefault(r => r.Id == relationshipId);
        if (relationship is null)
        {
            return Result<ReportDefinition>.Failure(DomainError.NotFound($"Relationship {relationshipId}"));
        }

        if (string.IsNullOrEmpty(relationship.ChildKey))
        {
            return Result<ReportDefinition>.Failure(DomainError.Invalid("Relationship has no child key to filter on."));
        }

        var childMapping = definition.DataSources
            .SelectMany(d => d.EntityMappings)
            .FirstOrDefault(m => string.Equals(m.EntityAlias, relationship.ChildAlias, StringComparison.OrdinalIgnoreCase));
        if (childMapping is null || string.IsNullOrEmpty(childMapping.EntityLogicalName))
        {
            return Result<ReportDefinition>.Failure(DomainError.NotFound($"Child entity mapping '{relationship.ChildAlias}'"));
        }

        return Result<ReportDefinition>.Success(new ReportDefinition
        {
            Id = definition.Id,
            Name = $"{definition.Name} — {relationship.ChildAlias}",
            MainEntityLogicalName = childMapping.EntityLogicalName,
            RowLimit = definition.RowLimit,
            DataSources =
            [
                new ReportDataSource
                {
                    Id = Guid.Empty,
                    EntityMappings =
                    [
                        new ReportEntityMapping
                        {
                            Id = Guid.Empty,
                            EntityLogicalName = childMapping.EntityLogicalName,
                            EntityAlias = childMapping.EntityAlias,
                            Columns = childMapping.Columns
                        }
                    ]
                }
            ],
            Filters =
            [
                new ReportFilter
                {
                    Id = Guid.Empty,
                    FieldAlias = relationship.ChildKey,
                    Operator = new CodedValue(null, "Equals"),
                    Value = parentKey,
                    IsRuntimePrompt = false,
                    Sequence = 1
                }
            ]
        });
    }
}
