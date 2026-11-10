using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Reads a published form from qdb_form_render_cache the way DFE's qdb_GetPublishedFormJson
    /// does: qdb_runtime_json is a memo holding Base64 of the gzipped UTF-8 JSON when
    /// qdb_is_compressed is true (cloud and on-prem alike). Unlike the DFE API it reads an exact
    /// version, active or superseded, because an invitation renders the version it was pinned to.
    /// </summary>
    public sealed class PublishedFormReader : IPublishedFormReader
    {
        private readonly IOrganizationService _service;

        public PublishedFormReader(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public string FindRuntimeJson(string formCode, int version, string languageCode)
        {
            var query = new QueryExpression("qdb_form_render_cache") { ColumnSet = new ColumnSet("qdb_runtime_json", "qdb_is_compressed"), TopCount = 1 };
            query.Criteria.AddCondition("qdb_form_code", ConditionOperator.Equal, formCode);
            query.Criteria.AddCondition("qdb_published_version", ConditionOperator.Equal, version);
            query.Criteria.AddCondition("qdb_language_code", ConditionOperator.Equal, languageCode);
            query.AddOrder("modifiedon", OrderType.Descending);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            var stored = row?.GetAttributeValue<string>("qdb_runtime_json");
            if (string.IsNullOrEmpty(stored)) return null;
            return row.GetAttributeValue<bool?>("qdb_is_compressed") == true ? Decompress(stored) : stored;
        }

        /// <summary>Base64 of gzipped UTF-8 → the JSON text; public so tests can round-trip it.</summary>
        public static string Decompress(string base64)
        {
            using (var input = new MemoryStream(Convert.FromBase64String(base64)))
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            using (var reader = new StreamReader(gzip, Encoding.UTF8))
                return reader.ReadToEnd();
        }
    }
}
