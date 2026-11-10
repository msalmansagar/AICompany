using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Turns one due trigger into candidates, one per customer of its population that has no
    /// invitation for the period yet. A trigger-wide problem (outside window, delivery None) is
    /// logged once, without a customer, instead of once per customer.
    /// </summary>
    public sealed class ScheduledCandidateBuilder
    {
        private readonly RunDueSurveysDependencies _deps;
        private readonly SuppressionRecorder _suppressions;
        private readonly FormPinner _pinner;

        public ScheduledCandidateBuilder(RunDueSurveysDependencies dependencies, SuppressionRecorder suppressions, FormPinner pinner)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _suppressions = suppressions ?? throw new ArgumentNullException(nameof(suppressions));
            _pinner = pinner ?? throw new ArgumentNullException(nameof(pinner));
        }

        /// <summary>The trigger's candidates, how many customers already had the period's invitation, and any configuration problem.</summary>
        public ScheduledTriggerCandidates Build(ScheduledRun run)
        {
            var trigger = run.Trigger;
            var problem = FindConfigurationProblem(trigger);
            if (problem != null) return new ScheduledTriggerCandidates { Problem = problem };
            if (!IsSendable(trigger)) return new ScheduledTriggerCandidates();
            var existing = _deps.ScheduledInvitations.GetDedupeKeys(trigger.Setup.Id, run.Period.Key);
            var keyed = ReadPopulation(run).Select(customerId => new { customerId, key = DedupeKey.ForSchedule(trigger.Setup.Id, customerId, run.Period.Key) }).ToList();
            return new ScheduledTriggerCandidates
            {
                AlreadyGenerated = keyed.Count(k => existing.Contains(k.key)),
                Candidates = keyed.Where(k => !existing.Contains(k.key)).Select(k => Pin(run, k.customerId, k.key)).Where(c => c != null).ToList(),
            };
        }

        private static string FindConfigurationProblem(SurveyTrigger trigger)
        {
            if (trigger.Schedule.Population == SchedulePopulation.ActiveInPeriod && trigger.Schedule.PopulationSource == null)
                return $"Trigger {trigger.Id:D} is 'Active in period' but has no population source.";
            return null;
        }

        // Scheduled invitations have no request, so they use the setup's Digital delivery.
        private bool IsSendable(SurveyTrigger trigger)
        {
            var evaluation = new TriggerEvaluation(trigger, trigger.Schedule.PopulationSource, new RecordChange());
            if (!ActiveWindow.IsOpen(trigger.Setup, _deps.Pipeline.Clock.UtcNow)) { _suppressions.Record(evaluation, SuppressionReason.OutsideWindow, "Scheduled run: today is outside the setup's active window."); return false; }
            if (trigger.Setup.DeliveryDigital == DeliveryChoice.None) { _suppressions.Record(evaluation, SuppressionReason.ChannelNone, "Scheduled run: the setup's Digital delivery is None."); return false; }
            return true;
        }

        private IReadOnlyList<Guid> ReadPopulation(ScheduledRun run)
        {
            var schedule = run.Trigger.Schedule;
            if (schedule.Population == SchedulePopulation.AllActiveCustomers) return _deps.Population.GetActiveCustomers();
            return _deps.Population.GetCustomersActiveIn(new PopulationQuery
            {
                Source = schedule.PopulationSource, Period = run.Period, StatusValues = run.Trigger.StatusValues, TypeValues = run.Trigger.TypeValues,
            });
        }

        private InvitationCandidate Pin(ScheduledRun run, Guid customerId, string dedupeKey)
        {
            var evaluation = new TriggerEvaluation(run.Trigger, run.Trigger.Schedule.PopulationSource, RecordChange.ForScheduledCustomer(customerId));
            var slot = new ScheduledSlot(run.Period.Key, ScheduleCalendar.FixedExpiry(run.Trigger.Schedule.Period, run.Period));
            return _pinner.Pin(evaluation, new InvitationPlanRequest { Delivery = run.Trigger.Setup.DeliveryDigital, Key = new InvitationKey(dedupeKey, slot), Settings = run.Settings });
        }
    }
}
