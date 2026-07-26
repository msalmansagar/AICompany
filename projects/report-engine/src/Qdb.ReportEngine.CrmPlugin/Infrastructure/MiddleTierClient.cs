using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using Qdb.ReportEngine.CrmPlugin.Model;

namespace Qdb.ReportEngine.CrmPlugin.Infrastructure
{
    /// <summary>
    /// Relays a run to the middle tier over HTTPS. A run hits <c>/execute</c> (JSON rows); an export
    /// hits <c>/export?format=</c> and the file is base64-encoded into the payload.
    ///
    /// Authentication follows ADR-RPT-010: the shared secret in <c>Authorization: ServiceToken</c>
    /// proves this is a trusted relay, which is what permits the acting user in
    /// <c>X-Report-Caller-Id</c> to be honoured. The header alone carries no authority — the plugin
    /// establishes the user's identity from the CRM session, and the secret is what vouches for it.
    /// </summary>
    internal static class MiddleTierClient
    {
        /// <summary>Authorization scheme the middle tier registers for trusted CRM entry points.</summary>
        internal const string ServiceTokenScheme = "ServiceToken";

        // A single shared HttpClient — plugins are pooled and reused, so a per-call client would leak sockets.
        private static readonly HttpClient Http = new HttpClient();

        static MiddleTierClient()
        {
            // net462 negotiates SSL3/TLS1.0 by default, which Azure and any hardened on-prem host
            // refuse outright — without this the callout fails as an opaque connection error.
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        }

        public static RelayResult Run(PluginConfiguration configuration, RunReportRequest request)
        {
            using (var message = BuildMessage(configuration, request))
            using (var cancellation = new CancellationTokenSource(configuration.SyncTimeoutMs))
            {
                try
                {
                    var response = Http.SendAsync(message, cancellation.Token).GetAwaiter().GetResult();
                    return ReadResponse(response, request.Format);
                }
                catch (OperationCanceledException)
                {
                    return RelayResult.Timeout();
                }
                catch (HttpRequestException error)
                {
                    return RelayResult.Failure("middle_tier_unreachable", error.Message);
                }
            }
        }

        internal static HttpRequestMessage BuildMessage(PluginConfiguration configuration, RunReportRequest request)
        {
            var path = request.Format.IsExport()
                ? $"/api/reports/{request.ReportId}/export?format={request.Format.ToExportQueryValue()}"
                : $"/api/reports/{request.ReportId}/execute";

            var message = new HttpRequestMessage(HttpMethod.Post, configuration.MiddleTierUrl + path)
            {
                Content = new StringContent(BuildBody(request.ParametersJson), Encoding.UTF8, "application/json")
            };
            message.Headers.Authorization =
                new AuthenticationHeaderValue(ServiceTokenScheme, configuration.ServiceToken);
            message.Headers.TryAddWithoutValidation("X-Report-Caller-Id", request.CallerId.ToString());
            message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
            return message;
        }

        // parametersJson is already JSON; wrap it in the ReportExecutionRequest envelope the API expects.
        private static string BuildBody(string parametersJson)
        {
            var values = string.IsNullOrWhiteSpace(parametersJson) ? "{}" : parametersJson;
            return "{\"parameterValues\":" + values + "}";
        }

        private static RelayResult ReadResponse(HttpResponseMessage response, ReportFormat format)
        {
            if (!response.IsSuccessStatusCode)
            {
                return RelayResult.Failure("middle_tier_" + (int)response.StatusCode, ReadErrorMessage(response));
            }

            if (format.IsExport())
            {
                var bytes = response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                return RelayResult.Success(Convert.ToBase64String(bytes));
            }

            return RelayResult.Success(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        }

        // Do not surface the raw body verbatim — keep the caller-facing message short and generic.
        private static string ReadErrorMessage(HttpResponseMessage response) =>
            $"The report engine returned {(int)response.StatusCode} ({response.ReasonPhrase}).";
    }
}
