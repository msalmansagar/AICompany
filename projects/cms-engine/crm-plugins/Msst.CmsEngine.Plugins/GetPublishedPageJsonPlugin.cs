using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>
    /// Implements <c>msst_CmsGetPublishedPageJson</c>: reads the render cache,
    /// decodes it, returns plain JSON. Never generates.
    /// </summary>
    /// <remarks>
    /// Used by the editor. Visitors are served by the portal, which reads the
    /// render-cache row directly and decompresses in Node — that is what keeps
    /// a Custom Action's workflow overhead off the on-premise hot path (§7).
    /// </remarks>
    public sealed class GetPublishedPageJsonPlugin : PluginBase
    {
        private const string RenderCacheEntity = "msst_cmsrendercache";

        protected override void Run(
            IPluginExecutionContext context,
            IOrganizationService service,
            ITracingService tracing)
        {
            var site = RequireInput<string>(context, "Site");
            var slug = RequireInput<string>(context, "Slug");
            var languageCode = RequireInput<string>(context, "LanguageCode");

            // The slug alone is not an address. Two portals may each have an
            // "about" page, so the cache is keyed by site and slug together.
            var routeKey = site + "/" + slug;
            tracing.Trace("Reading cache for {0} ({1})", routeKey, languageCode);

            var cache = FindRenderCache(service, routeKey);
            if (cache == null)
            {
                throw new InvalidPluginExecutionException(
                    "No published content at '" + routeKey + "'. A draft is never served (FR-66).");
            }

            var stored = cache.GetAttributeValue<string>("msst_runtimejson");
            context.OutputParameters["PageJson"] = PagePayload.Decode(stored);
        }

        private static Entity FindRenderCache(IOrganizationService service, string slug)
        {
            var query = new QueryExpression(RenderCacheEntity)
            {
                ColumnSet = new ColumnSet("msst_runtimejson"),
                TopCount = 1,
                Criteria =
                {
                    Conditions = { new ConditionExpression("msst_cachekey", ConditionOperator.Equal, slug) },
                },
            };
            return service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }
    }
}
