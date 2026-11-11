using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// Custom API qdb_srv_RunDueSurveys (A1, section 7): optional input RunDate (string yyyy-MM-dd),
    /// outputs Summary (string) and IsComplete (bool). Called daily by a Windows Scheduled Task
    /// on-prem and by a Power Automate recurrence on cloud, which call again while IsComplete is
    /// false. System Administrator only; the work runs as SYSTEM.
    /// </summary>
    public sealed class RunDueSurveysPlugin : IPlugin
    {
        public const string RunDateParameter = "RunDate";
        public const string SummaryProperty = "Summary";
        public const string IsCompleteProperty = "IsComplete";

        // Under the 2-minute plugin limit, leaving time to write the outputs.
        private static readonly TimeSpan WorkAllowance = TimeSpan.FromSeconds(90);

        /// <summary>Plugin entry point.</summary>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new InvalidPluginExecutionException("serviceProvider must not be null.");
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var runDate = ReadRunDate(context, DateTime.UtcNow);
            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            if (!new AdministratorCheck(system).IsSystemAdministrator(context.InitiatingUserId))
                throw new InvalidPluginExecutionException("Only a System Administrator can run due surveys (the scheduler's account must have the role).");
            var clock = new SystemClock();
            var summary = BuildService(system, clock, tracing).Run(runDate, new RunBudget(clock, WorkAllowance));
            tracing.Trace("Run due surveys for {0:yyyy-MM-dd}: {1}", runDate, summary);
            context.OutputParameters[SummaryProperty] = summary.ToString();
            context.OutputParameters[IsCompleteProperty] = summary.IsComplete;
        }

        /// <summary>
        /// The calendar date to run for: the RunDate input, else today in UTC. The scheduler passes its
        /// own local date, so a run just after local midnight on the 1st is not read as the 30th in UTC;
        /// an administrator can also re-run a missed day by passing it.
        /// </summary>
        public static DateTime ReadRunDate(IPluginExecutionContext context, DateTime utcNow)
        {
            if (!context.InputParameters.Contains(RunDateParameter) || string.IsNullOrWhiteSpace(context.InputParameters[RunDateParameter] as string)) return utcNow.Date;
            DateTime runDate;
            var text = ((string)context.InputParameters[RunDateParameter]).Trim();
            if (!DateTime.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out runDate))
                throw new InvalidPluginExecutionException($"{RunDateParameter} must be a date in the form yyyy-MM-dd; got '{text}'.");
            return runDate;
        }

        private static RunDueSurveysService BuildService(IOrganizationService service, IClock clock, ITracingService tracing)
        {
            var customer = CustomerLinkReader.Read(service);
            return RunDueSurveysService.Compose(new RunDueSurveysDependencies
            {
                Pipeline = new SurveyTriggerDependencies
                {
                    Config = new SurveyConfigRepository(service),
                    Languages = new CustomerLanguageReader(service, customer),
                    RenderCache = new CachedRenderCacheReader(new RenderCacheReader(service)),
                    Invitations = new InvitationRepository(service, customer),
                    Suppressions = new SuppressionLogWriter(service, customer),
                    Clock = clock,
                    Trace = new TracingServiceTrace(tracing),
                },
                ScheduledTriggers = new ScheduledTriggerRepository(service),
                Population = new CustomerPopulationReader(service, customer),
                ScheduledInvitations = new ScheduledInvitationReader(service),
                Postponed = new PostponedInvitationStore(service, customer),
                Retention = new ResponseRetentionStore(service, customer),
            });
        }
    }
}
