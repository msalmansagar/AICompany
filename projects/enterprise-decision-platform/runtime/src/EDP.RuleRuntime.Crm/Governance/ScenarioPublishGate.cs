using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Crm.Metadata;
using EDP.RuleRuntime.Crm.Scenarios;
using EDP.RuleRuntime.Scenarios;

namespace EDP.RuleRuntime.Crm.Governance
{
    /// <summary>
    /// Publish gate backed by the rule's saved scenario suite: the version being published is run
    /// against every stored scenario and Publish is blocked if any regresses. A rule with no saved
    /// scenarios passes the gate (nothing to regress against).
    /// </summary>
    public sealed class ScenarioPublishGate : IPublishGate
    {
        private readonly IOrganizationService _service;

        public ScenarioPublishGate(IOrganizationService service)
            => _service = service ?? throw new ArgumentNullException(nameof(service));

        public PublishGateResult Check(Guid ruleVersionId)
        {
            var version = _service.Retrieve("qdb_edp_ruleversion", ruleVersionId,
                new ColumnSet("qdb_edp_pcrmjson", "qdb_edp_ruleid"));
            var ruleId = version.GetAttributeValue<EntityReference>("qdb_edp_ruleid")?.Id;
            if (ruleId == null) return PublishGateResult.Pass();

            var scenariosJson = ScenarioStore.LoadScenariosJson(_service, ruleId.Value);
            if (string.IsNullOrWhiteSpace(scenariosJson)) return PublishGateResult.Pass();

            var pcrmJson = version.GetAttributeValue<string>("qdb_edp_pcrmjson");
            if (string.IsNullOrWhiteSpace(pcrmJson)) return PublishGateResult.Pass();

            var runtime = new RuleRuntimeService(new OrgServiceMetadataResolver(_service));
            var summary = ScenarioRunner.Run(scenariosJson, pcrmJson!, runtime, DateTime.UtcNow);
            if (summary.AllPassed)
                return PublishGateResult.Pass($"{summary.Passed}/{summary.Total} scenarios passed.");

            var failed = summary.Results.Where(r => !r.Passed).Select(r => r.Name);
            return PublishGateResult.Block(
                $"Regression gate: {summary.Failed} of {summary.Total} saved scenarios failed ({string.Join(", ", failed)}). Fix the rule or update the scenarios before publishing.");
        }
    }
}
