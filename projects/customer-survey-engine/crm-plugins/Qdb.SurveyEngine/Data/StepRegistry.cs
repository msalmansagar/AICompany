using System;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Activation;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// SurveyTriggerPlugin step registration through the Organization Service (section 6.1). Steps
    /// are found by name, which follows the same convention as provisioning/lib/plugin-payloads.mjs.
    /// </summary>
    public sealed class StepRegistry : IStepRegistry
    {
        public const string PluginTypeName = "Qdb.SurveyEngine.Plugins.SurveyTriggerPlugin";
        public const string PreImageName = "PreImage";
        private const int AsyncMode = 1;
        private const int PostOperationStage = 40;
        private const int PreImageType = 0;
        private readonly IOrganizationService _service;

        public StepRegistry(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <summary>The step name, e.g. "Qdb.SurveyEngine.Plugins.SurveyTriggerPlugin: Async Update of qdb_cheque_clearing".</summary>
        public static string StepName(StepSpec spec) => $"{PluginTypeName}: Async {spec.Message} of {spec.Table}";

        /// <inheritdoc />
        public bool SupportsMessage(string table, string message) => FindMessageFilterId(table, FindMessageId(message)).HasValue;

        /// <inheritdoc />
        public RegisteredStep Find(StepSpec spec)
        {
            var query = new QueryExpression("sdkmessageprocessingstep") { ColumnSet = new ColumnSet("statecode", "filteringattributes"), TopCount = 1 };
            query.Criteria.AddCondition("name", ConditionOperator.Equal, StepName(spec));
            var step = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            if (step == null) return null;
            return new RegisteredStep
            {
                Id = step.Id,
                IsEnabled = step.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0,
                FilteringAttributes = step.GetAttributeValue<string>("filteringattributes"),
                PreImageAttributes = FindPreImage(step.Id)?.GetAttributeValue<string>("attributes"),
            };
        }

        /// <inheritdoc />
        public Guid Create(StepSpec spec)
        {
            var messageId = FindMessageId(spec.Message);
            var step = new Entity("sdkmessageprocessingstep")
            {
                ["name"] = StepName(spec),
                ["description"] = $"Survey triggers for {spec.Table} (FR-CSE-026..030). Created by qdb_srv_ActivateSource.",
                ["mode"] = new OptionSetValue(AsyncMode),
                ["stage"] = new OptionSetValue(PostOperationStage),
                ["rank"] = 1,
                ["asyncautodelete"] = true,
                ["sdkmessageid"] = new EntityReference("sdkmessage", messageId),
                ["sdkmessagefilterid"] = new EntityReference("sdkmessagefilter", FindMessageFilterId(spec.Table, messageId).Value),
                ["plugintypeid"] = new EntityReference("plugintype", FindPluginTypeId()),
            };
            if (spec.IsUpdate) step["filteringattributes"] = spec.StatusField;
            var stepId = _service.Create(step);
            if (spec.IsUpdate) _service.Create(BuildPreImage(stepId, spec.StatusField));
            return stepId;
        }

        /// <inheritdoc />
        public void Reconfigure(Guid stepId, StepSpec spec)
        {
            _service.Update(new Entity("sdkmessageprocessingstep", stepId) { ["filteringattributes"] = spec.StatusField });
            var image = FindPreImage(stepId);
            if (image == null) _service.Create(BuildPreImage(stepId, spec.StatusField));
            else _service.Update(new Entity("sdkmessageprocessingstepimage", image.Id) { ["attributes"] = spec.StatusField });
        }

        /// <inheritdoc />
        public void SetEnabled(Guid stepId, bool isEnabled)
        {
            // SetStateRequest, not a plain Update of statecode: the on-prem 9.1 orgs do not guarantee the latter.
            _service.Execute(new SetStateRequest
            {
                EntityMoniker = new EntityReference("sdkmessageprocessingstep", stepId),
                State = new OptionSetValue(isEnabled ? 0 : 1),
                Status = new OptionSetValue(isEnabled ? 1 : 2),
            });
        }

        /// <inheritdoc />
        public void Delete(Guid stepId) => _service.Delete("sdkmessageprocessingstep", stepId);

        private Entity FindPreImage(Guid stepId)
        {
            var query = new QueryExpression("sdkmessageprocessingstepimage") { ColumnSet = new ColumnSet("attributes"), TopCount = 1 };
            query.Criteria.AddCondition("sdkmessageprocessingstepid", ConditionOperator.Equal, stepId);
            query.Criteria.AddCondition("entityalias", ConditionOperator.Equal, PreImageName);
            return _service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }

        private static Entity BuildPreImage(Guid stepId, string statusField) => new Entity("sdkmessageprocessingstepimage")
        {
            ["name"] = PreImageName,
            ["entityalias"] = PreImageName,
            ["imagetype"] = new OptionSetValue(PreImageType),
            ["messagepropertyname"] = "Target",
            ["attributes"] = statusField,
            ["sdkmessageprocessingstepid"] = new EntityReference("sdkmessageprocessingstep", stepId),
        };

        private Guid FindMessageId(string message) =>
            FindSingleId("sdkmessage", "name", message) ?? throw new InvalidOperationException($"SDK message {message} not found.");

        private Guid FindPluginTypeId() =>
            FindSingleId("plugintype", "typename", PluginTypeName) ?? throw new InvalidOperationException($"Plugin type {PluginTypeName} is not registered.");

        private Guid? FindMessageFilterId(string table, Guid messageId)
        {
            var query = new QueryExpression("sdkmessagefilter") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("sdkmessageid", ConditionOperator.Equal, messageId);
            query.Criteria.AddCondition("primaryobjecttypecode", ConditionOperator.Equal, table);
            return _service.RetrieveMultiple(query).Entities.FirstOrDefault()?.Id;
        }

        private Guid? FindSingleId(string entity, string attribute, string value)
        {
            var query = new QueryExpression(entity) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition(attribute, ConditionOperator.Equal, value);
            return _service.RetrieveMultiple(query).Entities.FirstOrDefault()?.Id;
        }
    }
}
