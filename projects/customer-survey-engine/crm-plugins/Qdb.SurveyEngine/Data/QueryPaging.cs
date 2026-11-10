using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads every page of a query; RetrieveMultiple alone stops silently at 5,000 rows.</summary>
    internal static class QueryPaging
    {
        private const int PageSize = 5000;

        /// <summary>All rows matching <paramref name="query"/>, page by page. The query must have an order for stable paging.</summary>
        public static IReadOnlyList<Entity> RetrieveAll(this IOrganizationService service, QueryExpression query)
        {
            query.PageInfo = new PagingInfo { Count = PageSize, PageNumber = 1 };
            var rows = new List<Entity>();
            while (true)
            {
                var page = service.RetrieveMultiple(query);
                rows.AddRange(page.Entities);
                if (!page.MoreRecords) return rows;
                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = page.PagingCookie;
            }
        }
    }
}
