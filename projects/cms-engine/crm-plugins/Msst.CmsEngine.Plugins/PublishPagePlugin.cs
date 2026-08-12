using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>
    /// Implements <c>msst_CmsPublishPage</c>: validates the latest version,
    /// writes the render cache, and writes the audit row — in one operation.
    /// </summary>
    /// <remarks>
    /// FR-64 requires that publishing without a log entry is not possible. That
    /// is why the audit row is written here and not by the caller: if the browser
    /// both flipped the live version and wrote the log, a user could keep the
    /// write and skip the log.
    /// </remarks>
    public sealed class PublishPagePlugin : PluginBase
    {
        private const string PageEntity = "msst_cmspage";
        private const string VersionEntity = "msst_cmspageversion";
        private const string RenderCacheEntity = "msst_cmsrendercache";
        private const string PublishLogEntity = "msst_cmspublishlog";

        private const int StatusPublished = 100000002;

        protected override void Run(
            IPluginExecutionContext context,
            IOrganizationService service,
            ITracingService tracing)
        {
            var pageId = RequireInput<Guid>(context, "PageId");
            var comment = OptionalInput<string>(context, "Comment", string.Empty);

            var page = ReadPage(service, pageId);
            var version = ReadLatestVersion(service, pageId);

            var storedContent = version.GetAttributeValue<string>("msst_contentjson");
            if (string.IsNullOrEmpty(storedContent))
            {
                throw new InvalidPluginExecutionException(
                    "Publish rejected: the latest version carries no content.");
            }

            var json = PagePayload.Decode(storedContent);
            var validation = PublishValidator.Validate(json, storedContent);
            if (validation.IsRejected)
            {
                throw new InvalidPluginExecutionException(validation.Message);
            }

            var versionNumber = version.GetAttributeValue<int>("msst_versionnumber");
            tracing.Trace("Publishing {0} version {1}", page.GetAttributeValue<string>("msst_slug"), versionNumber);

            WriteRenderCache(service, page, storedContent);
            MarkPagePublished(service, pageId);
            WriteAuditRow(service, page, versionNumber, comment);

            context.OutputParameters["PublishedVersionNumber"] = versionNumber;
            context.OutputParameters["Message"] = validation.Message.Length > 0
                ? validation.Message
                : "Published.";
        }

        private static Entity ReadPage(IOrganizationService service, Guid pageId)
        {
            var page = service.Retrieve(PageEntity, pageId, new ColumnSet("msst_slug", "msst_status"));
            if (page == null) throw new InvalidPluginExecutionException("Page not found.");
            return page;
        }

        /// <summary>
        /// Reads the latest version. The column set is explicit because a Memo
        /// column is returned with the record otherwise, and the payload is large
        /// (AC-08.2).
        /// </summary>
        private static Entity ReadLatestVersion(IOrganizationService service, Guid pageId)
        {
            var query = new QueryExpression(VersionEntity)
            {
                ColumnSet = new ColumnSet("msst_versionnumber", "msst_contentjson"),
                TopCount = 1,
                Criteria =
                {
                    Conditions =
                    {
                        new ConditionExpression("msst_pageid", ConditionOperator.Equal, pageId),
                    },
                },
                Orders = { new OrderExpression("msst_versionnumber", OrderType.Descending) },
            };

            var found = service.RetrieveMultiple(query).Entities.FirstOrDefault();
            if (found == null)
            {
                throw new InvalidPluginExecutionException("Publish rejected: the page has no versions.");
            }
            return found;
        }

        /// <summary>Replaces the cached output, creating it on first publish.</summary>
        private static void WriteRenderCache(IOrganizationService service, Entity page, string storedContent)
        {
            var slug = page.GetAttributeValue<string>("msst_slug");
            var existing = FindRenderCache(service, slug);

            var cache = new Entity(RenderCacheEntity)
            {
                ["msst_cachekey"] = slug,
                ["msst_runtimejson"] = storedContent,
                ["msst_languagecode"] = "both",
            };

            if (existing == null)
            {
                service.Create(cache);
                return;
            }

            cache.Id = existing.Id;
            service.Update(cache);
        }

        private static Entity FindRenderCache(IOrganizationService service, string slug)
        {
            var query = new QueryExpression(RenderCacheEntity)
            {
                ColumnSet = new ColumnSet("msst_cachekey"),
                TopCount = 1,
                Criteria =
                {
                    Conditions = { new ConditionExpression("msst_cachekey", ConditionOperator.Equal, slug) },
                },
            };
            return service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }

        private static void MarkPagePublished(IOrganizationService service, Guid pageId)
        {
            service.Update(new Entity(PageEntity, pageId)
            {
                ["msst_status"] = new OptionSetValue(StatusPublished),
            });
        }

        /// <summary>Append-only: the log is written, never updated (FR-64).</summary>
        private static void WriteAuditRow(
            IOrganizationService service,
            Entity page,
            int versionNumber,
            string comment)
        {
            var slug = page.GetAttributeValue<string>("msst_slug");
            service.Create(new Entity(PublishLogEntity)
            {
                ["msst_logkey"] = slug + " v" + versionNumber,
                ["msst_action"] = string.IsNullOrEmpty(comment) ? "Publish" : "Publish: " + comment,
                ["msst_versionnumber"] = versionNumber,
                ["msst_publishedon"] = DateTime.UtcNow,
            });
        }
    }
}
