using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Infrastructure;
using Qdb.ReportEngine.CrmPlugin.Model;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// Covers the relay's half of ADR-RPT-010: the plugin must present the shared secret, because
    /// without it the middle tier now refuses the call and the acting user it names counts for
    /// nothing.
    /// </summary>
    public sealed class MiddleTierRelayTests
    {
        private const string Url = "https://reports.example.com";
        private const string Secret = "shared-secret";
        private static readonly Guid ReportId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private static readonly Guid CallerId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        private static IOrganizationService ServiceWithUrl() => new FakeOrganizationService(
            new Dictionary<string, string> { ["qdb_rpt_middle_tier_url"] = Url });

        private static PluginConfiguration Configuration() =>
            PluginConfiguration.Load(ServiceWithUrl(), unsecureConfig: null, secureConfig: Secret);

        private static RunReportRequest Request(ReportFormat format = ReportFormat.Run) =>
            new RunReportRequest(ReportId, CallerId, parametersJson: null, format, async: false);

        [Fact]
        public void Load_WithNoTokenAnywhere_ThrowsNamingTheMissingSetting()
        {
            var error = Assert.Throws<InvalidPluginExecutionException>(
                () => PluginConfiguration.Load(ServiceWithUrl(), unsecureConfig: null, secureConfig: null));

            Assert.Contains("service token", error.Message, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Load_WithoutSecureConfig_FallsBackToTheEnvironmentVariable()
        {
            // The cloud Custom API path, where the platform-managed step exposes no secure config.
            var service = new FakeOrganizationService(new Dictionary<string, string>
            {
                ["qdb_rpt_middle_tier_url"] = Url,
                ["qdb_rpt_service_token"] = "from-environment"
            });

            var configuration = PluginConfiguration.Load(service, unsecureConfig: null, secureConfig: null);

            Assert.Equal("from-environment", configuration.ServiceToken);
        }

        [Fact]
        public void Load_PrefersSecureConfigOverTheEnvironmentVariable()
        {
            // On-premise supplies both; the less readable store must win.
            var service = new FakeOrganizationService(new Dictionary<string, string>
            {
                ["qdb_rpt_middle_tier_url"] = Url,
                ["qdb_rpt_service_token"] = "from-environment"
            });

            var configuration = PluginConfiguration.Load(service, unsecureConfig: null, secureConfig: Secret);

            Assert.Equal(Secret, configuration.ServiceToken);
        }

        [Fact]
        public void Load_WithoutUrl_Throws()
        {
            var emptyService = new FakeOrganizationService(new Dictionary<string, string>());

            Assert.Throws<InvalidPluginExecutionException>(
                () => PluginConfiguration.Load(emptyService, unsecureConfig: null, secureConfig: Secret));
        }

        [Fact]
        public void Load_TrimsTrailingSlashFromUrl()
        {
            var service = new FakeOrganizationService(
                new Dictionary<string, string> { ["qdb_rpt_middle_tier_url"] = Url + "/" });

            var configuration = PluginConfiguration.Load(service, unsecureConfig: null, secureConfig: Secret);

            Assert.Equal(Url, configuration.MiddleTierUrl);
        }

        [Fact]
        public void BuildMessage_PresentsTheServiceTokenScheme()
        {
            using (var message = MiddleTierClient.BuildMessage(Configuration(), Request()))
            {
                Assert.Equal("ServiceToken", message.Headers.Authorization.Scheme);
                Assert.Equal(Secret, message.Headers.Authorization.Parameter);
            }
        }

        [Fact]
        public void BuildMessage_NamesTheActingUser()
        {
            using (var message = MiddleTierClient.BuildMessage(Configuration(), Request()))
            {
                var callerId = message.Headers.GetValues("X-Report-Caller-Id").Single();

                Assert.Equal(CallerId.ToString(), callerId);
            }
        }

        [Fact]
        public void BuildMessage_RunUsesExecutePath()
        {
            using (var message = MiddleTierClient.BuildMessage(Configuration(), Request()))
            {
                Assert.Equal($"{Url}/api/reports/{ReportId}/execute", message.RequestUri.ToString());
            }
        }

        [Fact]
        public void BuildMessage_ExportUsesExportPathWithFormat()
        {
            using (var message = MiddleTierClient.BuildMessage(Configuration(), Request(ReportFormat.Pdf)))
            {
                Assert.Equal($"{Url}/api/reports/{ReportId}/export?format=pdf", message.RequestUri.ToString());
            }
        }
    }
}
