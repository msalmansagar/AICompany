using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.ReportEngine.CrmPlugin.Infrastructure
{
    /// <summary>
    /// Resolves the middle-tier location and sync timeout from Dataverse Environment Variables
    /// (<c>qdb_rpt_middle_tier_url</c>, <c>qdb_rpt_sync_timeout_ms</c>), falling back to the plugin's
    /// unsecure configuration for the URL. Keeping these out of code lets on-prem and cloud point at
    /// different hosts without a rebuild.
    /// </summary>
    internal sealed class PluginConfiguration
    {
        private const string MiddleTierUrlKey = "qdb_rpt_middle_tier_url";
        private const string SyncTimeoutKey = "qdb_rpt_sync_timeout_ms";
        private const int DefaultSyncTimeoutMs = 90000;

        private PluginConfiguration(string middleTierUrl, int syncTimeoutMs)
        {
            MiddleTierUrl = middleTierUrl;
            SyncTimeoutMs = syncTimeoutMs;
        }

        public string MiddleTierUrl { get; }

        public int SyncTimeoutMs { get; }

        public static PluginConfiguration Load(IOrganizationService service, string unsecureConfig)
        {
            var url = ReadVariable(service, MiddleTierUrlKey) ?? NullIfBlank(unsecureConfig);
            if (string.IsNullOrWhiteSpace(url))
            {
                throw new InvalidPluginExecutionException(
                    "Report Engine middle-tier URL is not configured. Set the environment variable qdb_rpt_middle_tier_url.");
            }

            return new PluginConfiguration(url.Trim().TrimEnd('/'), ResolveTimeout(service));
        }

        private static int ResolveTimeout(IOrganizationService service) =>
            int.TryParse(ReadVariable(service, SyncTimeoutKey), out var ms) && ms > 0 ? ms : DefaultSyncTimeoutMs;

        // Reads the current value of an environment variable by schema name; null when unset.
        private static string ReadVariable(IOrganizationService service, string schemaName)
        {
            var query = new QueryExpression("environmentvariablevalue")
            {
                ColumnSet = new ColumnSet("value"),
                TopCount = 1
            };
            var definition = query.AddLink(
                "environmentvariabledefinition", "environmentvariabledefinitionid", "environmentvariabledefinitionid");
            definition.LinkCriteria.AddCondition("schemaname", ConditionOperator.Equal, schemaName);

            var match = service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return NullIfBlank(match?.GetAttributeValue<string>("value"));
        }

        private static string NullIfBlank(string value) => string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
