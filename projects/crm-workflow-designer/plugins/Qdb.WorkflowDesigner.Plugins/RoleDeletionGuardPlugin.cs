// RoleDeletionGuardPlugin.cs
using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.WorkflowDesigner.Plugins
{
    /// <summary>
    /// Prevents deletion of a qdb_role that is referenced by any qdb_sopstep record.
    /// Registered: Pre-validation, Synchronous, Delete message on qdb_role.
    /// </summary>
    public sealed class RoleDeletionGuardPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(
                typeof(IPluginExecutionContext));
            var serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(
                typeof(IOrganizationServiceFactory));
            var service = serviceFactory.CreateOrganizationService(context.UserId);

            var roleId = context.PrimaryEntityId;

            if (RoleIsReferencedBySopStep(service, roleId))
            {
                throw new InvalidPluginExecutionException(
                    "This role cannot be deleted because it is assigned to one or more SOP steps. " +
                    "Remove the role from all SOP steps first, or deactivate it instead.");
            }
        }

        private static bool RoleIsReferencedBySopStep(
            IOrganizationService service,
            Guid roleId)
        {
            var query = new QueryExpression("qdb_sopstep")
            {
                ColumnSet = new ColumnSet(false),
                TopCount = 1,
            };
            query.Criteria.AddCondition(
                "qdb_role_id", ConditionOperator.Equal, roleId);

            return service.RetrieveMultiple(query).Entities.Count > 0;
        }
    }
}
