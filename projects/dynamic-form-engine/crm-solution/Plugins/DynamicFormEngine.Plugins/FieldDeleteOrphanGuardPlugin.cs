using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace DynamicFormEngine.Plugins
{
    /// <summary>
    /// Pre-delete plugin on dfe_field.
    /// Blocks deletion when any dfe_rulecondition.dfe_fieldid references the field being deleted,
    /// preventing silent rule evaluation failures caused by orphaned condition references.
    ///
    /// Registration:
    ///   Entity:     dfe_field
    ///   Message:    Delete
    ///   Stage:      Pre-Validation (10)
    ///   Mode:       Synchronous
    ///   Scope:      Organization
    /// </summary>
    public class FieldDeleteOrphanGuardPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = serviceFactory.CreateOrganizationService(context.UserId);
            var tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));

            if (!IsFieldDeleteMessage(context))
            {
                return;
            }

            var fieldId = context.PrimaryEntityId;
            tracingService.Trace($"FieldDeleteOrphanGuardPlugin: checking conditions for field {fieldId}");

            var referencingConditions = FindReferencingConditions(service, fieldId);

            if (referencingConditions.Count > 0)
            {
                var conditionIds = string.Join(", ", referencingConditions);
                tracingService.Trace($"FieldDeleteOrphanGuardPlugin: {referencingConditions.Count} orphan(s) would result — blocking delete");

                throw new InvalidPluginExecutionException(
                    OperationStatus.Failed,
                    $"Cannot delete this field. It is referenced by {referencingConditions.Count} rule condition(s) " +
                    $"(IDs: {conditionIds}). Remove the conditions before deleting the field."
                );
            }

            tracingService.Trace("FieldDeleteOrphanGuardPlugin: no referencing conditions found — allowing delete");
        }

        private static bool IsFieldDeleteMessage(IPluginExecutionContext context)
        {
            return string.Equals(context.MessageName, "Delete", StringComparison.OrdinalIgnoreCase)
                && string.Equals(context.PrimaryEntityName, "dfe_field", StringComparison.OrdinalIgnoreCase);
        }

        private static List<string> FindReferencingConditions(IOrganizationService service, Guid fieldId)
        {
            // dfe_rulecondition.dfe_fieldid is nvarchar — stored as GUID string without braces
            var fieldIdString = fieldId.ToString();

            var query = new QueryExpression("dfe_rulecondition")
            {
                ColumnSet = new ColumnSet("dfe_ruleconditionid"),
                Criteria = new FilterExpression(LogicalOperator.And),
                TopCount = 50,
            };

            query.Criteria.AddCondition("dfe_fieldid", ConditionOperator.Equal, fieldIdString);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);

            var result = service.RetrieveMultiple(query);
            var ids = new List<string>(result.Entities.Count);

            foreach (var entity in result.Entities)
            {
                ids.Add(entity.Id.ToString());
            }

            return ids;
        }
    }
}
