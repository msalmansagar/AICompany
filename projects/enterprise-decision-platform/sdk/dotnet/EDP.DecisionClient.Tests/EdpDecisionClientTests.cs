using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Edp.DecisionClient.Tests
{
    public class EdpDecisionClientTests
    {
        private sealed class FakeHandler : HttpMessageHandler
        {
            private readonly HttpStatusCode _status;
            private readonly string _json;
            public HttpRequestMessage? LastRequest;
            public string? LastBody;

            public FakeHandler(HttpStatusCode status, string json)
            {
                _status = status;
                _json = json;
            }

            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            {
                LastRequest = request;
                LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync();
                return new HttpResponseMessage(_status) { Content = new StringContent(_json, Encoding.UTF8, "application/json") };
            }
        }

        private static (EdpDecisionClient client, FakeHandler handler) Make(HttpStatusCode status, string json, string? apiKey = "k")
        {
            var handler = new FakeHandler(status, json);
            return (new EdpDecisionClient("https://gw.example.com/", apiKey, new HttpClient(handler)), handler);
        }

        [Fact]
        public async Task Evaluate_builds_envelope_and_parses_result()
        {
            var (client, handler) = Make(HttpStatusCode.OK,
                "{\"meta\":{\"correlationId\":\"c1\",\"executionId\":\"e1\",\"elapsedMs\":12},\"matched\":true,\"outputs\":{\"creditTier\":\"Gold\",\"discount\":15}}");

            var result = await client.EvaluateAsync(RuleRef.ByName("Account Credit Tier"),
                new Dictionary<string, object?> { ["revenue"] = 1500000 }, correlationId: "c1");

            Assert.True(result.Matched);
            Assert.Equal("Gold", result.Outputs["creditTier"].GetString());
            Assert.Equal(15, result.Outputs["discount"].GetInt32());
            Assert.Equal("e1", result.Meta.ExecutionId);

            Assert.Equal("https://gw.example.com/v1/decisions/evaluate", handler.LastRequest!.RequestUri!.ToString());
            Assert.Equal("k", handler.LastRequest.Headers.GetValues("x-api-key").First());

            using var doc = JsonDocument.Parse(handler.LastBody!);
            Assert.Equal("Account Credit Tier", doc.RootElement.GetProperty("rule").GetProperty("name").GetString());
            Assert.Equal(1500000, doc.RootElement.GetProperty("input").GetProperty("revenue").GetInt32());
            Assert.False(doc.RootElement.GetProperty("options").GetProperty("includeTrace").GetBoolean());
        }

        [Fact]
        public async Task Validate_hits_validate_endpoint()
        {
            var (client, handler) = Make(HttpStatusCode.OK, "{\"meta\":{},\"valid\":true,\"diagnostics\":[]}");
            var result = await client.ValidateAsync(RuleRef.ByName("Account Credit Tier"));
            Assert.True(result.Valid);
            Assert.EndsWith("/v1/rules/validate", handler.LastRequest!.RequestUri!.ToString());
        }

        [Fact]
        public async Task GetSchema_hits_schema_endpoint()
        {
            var (client, handler) = Make(HttpStatusCode.OK, "{\"meta\":{},\"inputs\":[{\"name\":\"revenue\"}],\"outputs\":[]}");
            var result = await client.GetSchemaAsync(RuleRef.ByName("x"));
            Assert.EndsWith("/v1/rules/schema", handler.LastRequest!.RequestUri!.ToString());
            Assert.NotNull(result.Inputs);
        }

        [Fact]
        public async Task Explain_posts_execution_log_id()
        {
            var (client, handler) = Make(HttpStatusCode.OK, "{\"meta\":{},\"result\":{\"narration\":\"x\"}}");
            var id = Guid.NewGuid();
            await client.ExplainAsync(id);
            Assert.EndsWith("/v1/decisions/explain", handler.LastRequest!.RequestUri!.ToString());
            using var doc = JsonDocument.Parse(handler.LastBody!);
            Assert.Equal(id.ToString(), doc.RootElement.GetProperty("executionLogId").GetString());
        }

        [Fact]
        public async Task Non_2xx_throws_typed_exception()
        {
            var (client, _) = Make(HttpStatusCode.NotFound, "{\"error\":{\"code\":\"rule_not_found\",\"message\":\"no published version\"}}");
            var ex = await Assert.ThrowsAsync<EdpDecisionException>(() => client.EvaluateAsync(RuleRef.ByName("Missing")));
            Assert.Equal("rule_not_found", ex.Code);
            Assert.Equal(404, ex.StatusCode);
        }

        [Fact]
        public async Task Omits_meta_and_apikey_when_absent()
        {
            var (client, handler) = Make(HttpStatusCode.OK, "{\"meta\":{},\"matched\":false,\"outputs\":{}}", apiKey: null);
            await client.EvaluateAsync(RuleRef.ByVersion("00000000-0000-0000-0000-000000000001"));
            Assert.False(handler.LastRequest!.Headers.Contains("x-api-key"));
            using var doc = JsonDocument.Parse(handler.LastBody!);
            Assert.False(doc.RootElement.TryGetProperty("meta", out _)); // meta omitted when null
            Assert.Equal("00000000-0000-0000-0000-000000000001", doc.RootElement.GetProperty("rule").GetProperty("versionId").GetString());
        }
    }
}
