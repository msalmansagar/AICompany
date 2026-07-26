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
    ///
    /// The middle-tier credential prefers the plugin's <em>secure</em> configuration, which the
    /// platform withholds from everyone but a registration administrator — this secret authorises
    /// naming the acting user (ADR-RPT-010), so a leak would hand back exactly the impersonation
    /// power B1 closed.
    ///
    /// Secure configuration is only reachable on the on-premise path, where the entry point is a
    /// Custom Action backed by an ordinary plugin step. A cloud Custom API is implemented by a
    /// platform-managed step pinned to the MainOperation stage, which Dataverse refuses to modify
    /// ("Steps can only be modified in stages Before/AfterMainOperation…"), so it has no secure
    /// configuration to read. Cloud therefore falls back to an environment variable.
    ///
    /// TODO(RPT-B1-CLOUD): that fallback is an interim. An environment variable is an ordinary row,
    /// so any user who can read it can call the middle tier as anyone — the B1 hole via another
    /// door. Replace it with a Dataverse plugin managed identity minting an Entra token for the
    /// middle tier's audience, which removes the shared secret from CRM altogether and lands on the
    /// EntraJwt scheme the middle tier already accepts.
    /// </summary>
    internal sealed class PluginConfiguration
    {
        private const string MiddleTierUrlKey = "qdb_rpt_middle_tier_url";
        private const string SyncTimeoutKey = "qdb_rpt_sync_timeout_ms";
        private const string ServiceTokenKey = "qdb_rpt_service_token";
        private const int DefaultSyncTimeoutMs = 90000;

        private PluginConfiguration(string middleTierUrl, string serviceToken, int syncTimeoutMs)
        {
            MiddleTierUrl = middleTierUrl;
            ServiceToken = serviceToken;
            SyncTimeoutMs = syncTimeoutMs;
        }

        public string MiddleTierUrl { get; }

        /// <summary>Shared secret proving to the middle tier that this is a trusted relay.</summary>
        public string ServiceToken { get; }

        public int SyncTimeoutMs { get; }

        public static PluginConfiguration Load(IOrganizationService service, string unsecureConfig, string secureConfig)
        {
            var url = ReadVariable(service, MiddleTierUrlKey) ?? NullIfBlank(unsecureConfig);
            if (string.IsNullOrWhiteSpace(url))
            {
                throw new InvalidPluginExecutionException(
                    "Report Engine middle-tier URL is not configured. Set the environment variable qdb_rpt_middle_tier_url.");
            }

            return new PluginConfiguration(
                url.Trim().TrimEnd('/'),
                RequireServiceToken(service, secureConfig),
                ResolveTimeout(service));
        }

        /// <summary>
        /// Fails fast rather than relaying an unauthenticated call: the middle tier would reject it
        /// with a 401 that surfaces to the user as an opaque failure, so the missing-configuration
        /// cause is worth naming here.
        /// </summary>
        private static string RequireServiceToken(IOrganizationService service, string secureConfig)
        {
            var token = NullIfBlank(secureConfig) ?? ReadVariable(service, ServiceTokenKey);
            if (token == null)
            {
                throw new InvalidPluginExecutionException(
                    "Report Engine service token is not configured. Set the plugin step's secure configuration "
                    + "(on-premise) or the environment variable qdb_rpt_service_token (cloud) to the middle "
                    + "tier's Auth:ServiceToken:Secret value.");
            }

            return token.Trim();
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
