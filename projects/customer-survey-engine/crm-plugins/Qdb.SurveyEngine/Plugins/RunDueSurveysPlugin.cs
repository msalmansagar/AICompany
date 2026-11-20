using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>
    /// Custom API qdb_srv_RunDueSurveys (A1, section 7): optional inputs RunDate (string yyyy-MM-dd) and
    /// Pass (OneTime / Daily / empty = both, DEF-CSE-002), outputs Summary (string) and IsComplete (bool). Called every 15 minutes by a Windows Scheduled
    /// Task on-prem and by a Power Automate recurrence on cloud, which call again while IsComplete is
    /// false: due One-time triggers on every call, the daily passes once per run date (ADR-010). A System Administrator or the Survey Scheduler role may call it (SchedulerAccessCheck);
    /// the work runs as SYSTEM.
    /// </summary>
    public sealed class RunDueSurveysPlugin : IPlugin
    {
        public const string RunDateParameter = "RunDate";
        public const string PassParameter = "Pass";
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
            var pass = ReadPass(context);
            var system = ((IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory))).CreateOrganizationService(null);
            if (!new SchedulerAccessCheck(system, new AdministratorCheck(system)).MayRunDueSurveys(context.InitiatingUserId))
                throw new InvalidPluginExecutionException($"Only a System Administrator or a user with the {SchedulerAccessCheck.SurveySchedulerRoleName} role can run due surveys (give the scheduler's account the {SchedulerAccessCheck.SurveySchedulerRoleName} role).");
            var runtime = new PluginRuntime { System = system, Customer = CustomerLinkReader.Read(system), Clock = new SystemClock(), Tracing = tracing, CallerId = context.InitiatingUserId };
            var summary = BuildService(runtime).Run(runDate, new RunBudget(runtime.Clock, WorkAllowance), pass);
            tracing.Trace("Run due surveys for {0:yyyy-MM-dd}, pass {1}: {2}", runDate, pass, summary);
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

        /// <summary>
        /// Which passes to run: the Pass input (OneTime or Daily, any case), else all of them. The scheduler calls
        /// each pass separately so each has its own transaction (DEF-CSE-002); an empty Pass keeps the old behaviour.
        /// </summary>
        public static RunPass ReadPass(IPluginExecutionContext context)
        {
            var text = context.InputParameters.Contains(PassParameter) ? (context.InputParameters[PassParameter] as string)?.Trim() : null;
            if (string.IsNullOrEmpty(text)) return RunPass.All;
            if (string.Equals(text, nameof(RunPass.OneTime), StringComparison.OrdinalIgnoreCase)) return RunPass.OneTime;
            if (string.Equals(text, nameof(RunPass.Daily), StringComparison.OrdinalIgnoreCase)) return RunPass.Daily;
            throw new InvalidPluginExecutionException($"{PassParameter} must be OneTime, Daily or empty; got '{text}'.");
        }

        private static RunDueSurveysService BuildService(PluginRuntime runtime)
        {
            var service = runtime.System;
            var customer = runtime.Customer;
            return RunDueSurveysService.Compose(new RunDueSurveysDependencies
            {
                Pipeline = PipelineComposition.BuildPipeline(runtime),
                CallerId = runtime.CallerId,
                ScheduledTriggers = new ScheduledTriggerRepository(service),
                Population = new CustomerPopulationReader(service, customer),
                ScheduledInvitations = new ScheduledInvitationReader(service),
                Postponed = new PostponedInvitationStore(service, customer),
                Retention = new ResponseRetentionStore(service, customer),
                InvitationRetention = new InvitationRetentionStore(service),
                SuppressionLogRetention = new SuppressionLogRetentionStore(service),
                OneTimeTriggers = new OneTimeTriggerStore(service),
                Audience = new AudienceReader(service),
                CustomerTable = customer.TableLogicalName,
                DailyPassGate = new DailyPassGate(service),
            });
        }
    }
}
