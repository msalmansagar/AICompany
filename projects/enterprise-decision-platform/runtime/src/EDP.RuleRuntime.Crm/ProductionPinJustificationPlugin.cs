using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// Restores ADR-12 layer 1 (per ADR-14): enforces C-006 / ADR-09 pin justification at the
    /// platform boundary. Registered as a synchronous pre-operation step on Create and Update of
    /// qdb_edp_ruleversion, filtered to the pin fields. When a write leaves a version pinned in a
    /// PRODUCTION environment, it must carry a pin justification code and a non-empty note;
    /// otherwise the write is rejected for every caller (Org Service, Web API, Power Automate).
    ///
    /// Field-level security (ADR-14) limits WHO may write the pin fields; this guard ensures a
    /// pinned result always carries recorded justification — the part field security cannot do.
    ///
    /// Enforced only in production (consistent with GovernanceService.EnforceSoD / ADR-12). A
    /// pre-image named "PreImage" carrying the pin fields must be registered on the Update step so
    /// the effective post-write state is known on partial updates.
    /// </summary>
    public sealed class ProductionPinJustificationPlugin : IPlugin
    {
        private const string EntityName = "qdb_edp_ruleversion";
        private const string IsPinned = "qdb_edp_ispinned";
        private const string JustificationCode = "qdb_edp_pinjustificationcode";
        private const string JustificationNote = "qdb_edp_pinjustificationnote";
        private const string PreImageName = "PreImage";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (!context.InputParameters.TryGetValue("Target", out var raw) || !(raw is Entity target)) return;
            if (!string.Equals(target.LogicalName, EntityName, StringComparison.OrdinalIgnoreCase)) return;

            var pre = context.PreEntityImages.Contains(PreImageName) ? context.PreEntityImages[PreImageName] : null;

            // Only a write that leaves the version pinned needs justification. Unpinning is free.
            if (!Effective<bool>(target, pre, IsPinned)) return;

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(null); // system context — read the config flag reliably
            if (!IsProduction(service)) return; // production-only, consistent with ADR-12 / SoD

            var code = Effective<OptionSetValue>(target, pre, JustificationCode);
            var note = Effective<string>(target, pre, JustificationNote);

            if (code == null || string.IsNullOrWhiteSpace(note))
                throw new InvalidPluginExecutionException(
                    "A production version pin requires a recorded justification (C-006 / ADR-09). " +
                    "Set both '" + JustificationCode + "' (code) and '" + JustificationNote + "' (note) when pinning.");
        }

        /// <summary>Resulting value after this write: the Target value if present, else the pre-image value.</summary>
        private static T Effective<T>(Entity target, Entity? pre, string attribute)
        {
            if (target.Contains(attribute)) return target.GetAttributeValue<T>(attribute);
            return pre != null ? pre.GetAttributeValue<T>(attribute) : default!;
        }

        private static bool IsProduction(IOrganizationService service)
        {
            try
            {
                var query = new QueryExpression("environmentvariablevalue")
                {
                    ColumnSet = new ColumnSet("value"),
                    LinkEntities =
                    {
                        new LinkEntity("environmentvariablevalue", "environmentvariabledefinition",
                            "environmentvariabledefinitionid", "environmentvariabledefinitionid", JoinOperator.Inner)
                        {
                            LinkCriteria = { Conditions = { new ConditionExpression("schemaname", ConditionOperator.Equal, "qdb_edp_IsProductionEnvironment") } }
                        }
                    }
                };
                var value = service.RetrieveMultiple(query).Entities.FirstOrDefault()?.GetAttributeValue<string>("value");
                return value != null && (value.Equals("yes", StringComparison.OrdinalIgnoreCase) || value.Equals("true", StringComparison.OrdinalIgnoreCase));
            }
            catch
            {
                // Fail safe (F-02 pattern): if the production flag cannot be read, ENFORCE rather than skip.
                return true;
            }
        }
    }
}
