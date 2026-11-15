using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Erasure;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// Custom API qdb_srv_EraseCustomerSurveyData (C.3, FR-CSE-081/082): inputs CustomerGuid
    /// (Guid), Mode (integer 100000000=Delete / 100000001=Anonymise), DryRun (bool); outputs
    /// InvitationCount, ResponseCount, AnswerCount, SuppressionLogCount (integers), AreActual and
    /// IsComplete (bools). Runs as SYSTEM; callers must hold Survey Data Officer or System
    /// Administrator (ErasureAccessCheck). Re-invoke while IsComplete is false (NFR-CSE-012).
    /// </summary>
    public sealed class EraseCustomerSurveyDataPlugin : IPlugin
    {
        public const string CustomerGuidParameter = "CustomerGuid";
        public const string ModeParameter = "Mode";
        public const string DryRunParameter = "DryRun";
        public const string InvitationCountProperty = "InvitationCount";
        public const string ResponseCountProperty = "ResponseCount";
        public const string AnswerCountProperty = "AnswerCount";
        public const string SuppressionLogCountProperty = "SuppressionLogCount";
        public const string AreActualProperty = "AreActual";
        public const string IsCompleteProperty = "IsComplete";

        // 110 s: 2-minute limit less margin for input reading and output writing.
        private static readonly TimeSpan WorkAllowance = TimeSpan.FromSeconds(110);

        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");

            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var request = ReadRequest(context);

            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            CheckAccess(system, context.InitiatingUserId);

            var clock = new SystemClock();
            var customer = CustomerLinkReader.Read(system);
            var service = CustomerErasureService.Compose(system, customer, clock, new ErasureLogWriter(system));
            var counts = service.Erase(request, new RunBudget(clock, WorkAllowance));

            WriteTrace(tracing, request, counts, clock.UtcNow);
            WriteOutputs(context, counts);
        }

        private static ErasureRequest ReadRequest(IPluginExecutionContext context)
        {
            if (!context.InputParameters.Contains(CustomerGuidParameter))
                throw new InvalidPluginExecutionException($"{CustomerGuidParameter} is required.");
            if (!context.InputParameters.Contains(ModeParameter))
                throw new InvalidPluginExecutionException($"{ModeParameter} is required.");
            if (!context.InputParameters.Contains(DryRunParameter))
                throw new InvalidPluginExecutionException($"{DryRunParameter} is required.");

            var modeValue = (int)context.InputParameters[ModeParameter];
            if (modeValue != (int)ErasureMode.Delete && modeValue != (int)ErasureMode.Anonymise)
                throw new InvalidPluginExecutionException($"{ModeParameter} must be {(int)ErasureMode.Delete} (Delete) or {(int)ErasureMode.Anonymise} (Anonymise); got {modeValue}.");

            return new ErasureRequest
            {
                CustomerId = (Guid)context.InputParameters[CustomerGuidParameter],
                InitiatingUserId = context.InitiatingUserId,
                Mode = (ErasureMode)modeValue,
                DryRun = (bool)context.InputParameters[DryRunParameter],
            };
        }

        private static void CheckAccess(IOrganizationService system, Guid initiatingUserId)
        {
            if (!new ErasureAccessCheck(system, new AdministratorCheck(system)).MayErase(initiatingUserId))
                throw new InvalidPluginExecutionException(
                    $"Only a System Administrator or a user with the {ErasureAccessCheck.SurveyDataOfficerRoleName} role can erase customer survey data.");
        }

        private static void WriteTrace(ITracingService tracing, ErasureRequest request, ErasureCounts counts, DateTime utcNow)
        {
            tracing.Trace(
                "Erase customer survey data: user={0}, customer={1}, mode={2}, dryRun={3}, inv={4}, resp={5}, ans={6}, supp={7}, areActual={8}, isComplete={9}, utc={10:u}",
                request.InitiatingUserId, request.CustomerId, request.Mode, request.DryRun,
                counts.InvitationCount, counts.ResponseCount, counts.AnswerCount, counts.SuppressionLogCount,
                counts.AreActual, counts.IsComplete, utcNow);
        }

        private static void WriteOutputs(IPluginExecutionContext context, ErasureCounts counts)
        {
            context.OutputParameters[InvitationCountProperty] = counts.InvitationCount;
            context.OutputParameters[ResponseCountProperty] = counts.ResponseCount;
            context.OutputParameters[AnswerCountProperty] = counts.AnswerCount;
            context.OutputParameters[SuppressionLogCountProperty] = counts.SuppressionLogCount;
            context.OutputParameters[AreActualProperty] = counts.AreActual;
            context.OutputParameters[IsCompleteProperty] = counts.IsComplete;
        }
    }
}
