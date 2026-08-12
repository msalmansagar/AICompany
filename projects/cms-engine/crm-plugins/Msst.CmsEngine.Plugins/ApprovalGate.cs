using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>
    /// Refuses a publish that has not been approved for the route its
    /// classification selects (FR-60, architecture §5).
    /// </summary>
    /// <remarks>
    /// This lives in the plugin because an approval workflow enforced only in
    /// the editor is a suggestion: a direct Web API write bypasses it entirely.
    /// The same reasoning puts the audit row and the size gate here.
    ///
    /// Two routes exist — regulated content and everything else — and the page's
    /// classification selects between them. The failure mode that creates is
    /// misclassification, which is why an author cannot set the classification
    /// and why the route is frozen onto the approval row at decision time.
    /// </remarks>
    public static class ApprovalGate
    {
        private const string RouteEntity = "msst_cmsapprovalroute";
        private const string ApprovalEntity = "msst_cmsapproval";

        private const int DecisionApproved = 100000001;
        private const int ClassificationStandard = 100000000;

        /// <summary>
        /// Throws unless the version carries an approval for the route the page's
        /// classification currently selects.
        /// </summary>
        public static void RequireApproval(
            IOrganizationService service,
            Entity page,
            Entity version,
            ITracingService tracing)
        {
            var classification = ReadClassification(page);
            var routeKey = ResolveRouteKey(service, classification);
            tracing.Trace("Approval required on route {0}", routeKey);

            var approval = FindApproval(service, version.Id, routeKey);
            if (approval == null)
            {
                throw new InvalidPluginExecutionException(
                    "Publish rejected: version " + version.GetAttributeValue<int>("msst_versionnumber") +
                    " has no approval for the '" + routeKey + "' route. Submit it for review first.");
            }

            RequireApproverIsNotAuthor(version, approval);
        }

        private static int ReadClassification(Entity page)
        {
            var classification = page.GetAttributeValue<OptionSetValue>("msst_classification");
            return classification?.Value ?? ClassificationStandard;
        }

        /// <summary>
        /// Routes are data, not constants, because approver groups change with
        /// people and adding a third route should be a data change rather than a
        /// release.
        /// </summary>
        private static string ResolveRouteKey(IOrganizationService service, int classification)
        {
            var query = new QueryExpression(RouteEntity)
            {
                ColumnSet = new ColumnSet("msst_routekey"),
                TopCount = 1,
                Criteria =
                {
                    Conditions =
                    {
                        new ConditionExpression("msst_classification", ConditionOperator.Equal, classification),
                    },
                },
            };

            var route = service.RetrieveMultiple(query).Entities.FirstOrDefault();
            if (route == null)
            {
                throw new InvalidPluginExecutionException(
                    "Publish rejected: no approval route is configured for this page's classification. " +
                    "An unconfigured route must not mean an unapproved page can publish.");
            }

            return route.GetAttributeValue<string>("msst_routekey");
        }

        /// <summary>
        /// The route is matched as it was frozen onto the approval row, not as
        /// the route table reads today. Otherwise editing the route table would
        /// retroactively change what past approvals meant.
        /// </summary>
        private static Entity FindApproval(IOrganizationService service, Guid versionId, string routeKey)
        {
            var query = new QueryExpression(ApprovalEntity)
            {
                ColumnSet = new ColumnSet("msst_decidedby", "msst_routekey"),
                TopCount = 1,
                Criteria =
                {
                    Conditions =
                    {
                        new ConditionExpression("msst_versionid", ConditionOperator.Equal, versionId),
                        new ConditionExpression("msst_routekey", ConditionOperator.Equal, routeKey),
                        new ConditionExpression("msst_decision", ConditionOperator.Equal, DecisionApproved),
                    },
                },
            };

            return service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }

        /// <summary>
        /// Maker-checker is not maker-checker if one person can do both. The BA
        /// phase names the approver as a distinct role from the author.
        /// </summary>
        private static void RequireApproverIsNotAuthor(Entity version, Entity approval)
        {
            var author = version.GetAttributeValue<EntityReference>("createdby");
            var approver = approval.GetAttributeValue<string>("msst_decidedby");

            if (author == null || string.IsNullOrEmpty(approver)) return;

            if (string.Equals(approver, author.Id.ToString(), StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidPluginExecutionException(
                    "Publish rejected: the approver is the author of this version. " +
                    "Approval must come from someone other than the person who wrote it.");
            }
        }
    }
}
