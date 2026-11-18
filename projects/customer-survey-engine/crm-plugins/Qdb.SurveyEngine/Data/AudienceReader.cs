using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Runs One-time audience queries as SYSTEM (FR-CSE-084, 089..091).</summary>
    public sealed class AudienceReader : IAudienceReader
    {
        private const int CountPageSize = 5000;
        private readonly IOrganizationService _service;

        public AudienceReader(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public AudiencePage ReadPage(AudienceQuery query, int pageNumber, string pagingCookie)
        {
            var page = _service.RetrieveMultiple(new FetchExpression(query.ToPageFetchXml(pageNumber, OneTimeSendService.PageSize, pagingCookie)));
            return new AudiencePage { CustomerIds = page.Entities.Select(row => row.Id).ToList(), MoreRecords = page.MoreRecords, PagingCookie = page.PagingCookie };
        }

        /// <inheritdoc />
        public int Count(AudienceQuery query)
        {
            var total = 0;
            string cookie = null;
            for (var pageNumber = 1; ; pageNumber++)
            {
                var page = _service.RetrieveMultiple(new FetchExpression(query.ToPageFetchXml(pageNumber, CountPageSize, cookie)));
                total += page.Entities.Count;
                if (!page.MoreRecords) return total;
                cookie = page.PagingCookie;
            }
        }
    }
}
