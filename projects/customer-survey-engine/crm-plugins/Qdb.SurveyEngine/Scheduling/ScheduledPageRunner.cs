using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>What one page did: the run state after it and how many of its customers already had the invitation.</summary>
    public sealed class ScheduledPage
    {
        public ScheduledPage(ScheduledRunState state, int alreadyHad, int evaluated)
        {
            State = state;
            AlreadyHad = alreadyHad;
            Evaluated = evaluated;
        }

        public ScheduledRunState State { get; }
        public int AlreadyHad { get; }
        public int Evaluated { get; }
    }

    /// <summary>
    /// Sends one page of a scheduled run (FR-001..003, ADR-011): reads the next 25 customers after the saved position,
    /// skips those whose period invitation exists (checking only this page's keys, research R4), and puts each other
    /// customer through the same rules as every invitation (FR-002). The caller saves the returned state.
    /// </summary>
    public sealed class ScheduledPageRunner
    {
        /// <summary>The One-time page size (DEF-CSE-002): the budget is checked between pages, so a page bounds the overrun.</summary>
        public const int PageSize = OneTimeSendService.PageSize;

        private readonly RunDueSurveysDependencies _deps;

        public ScheduledPageRunner(RunDueSurveysDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        /// <summary>Sends the page after <see cref="ScheduledRunState.LastCustomerId"/> and answers the advanced state.</summary>
        // Implements: FR-CSE-098; spec 001-scale-per-org FR-001..FR-003.
        public ScheduledPage Run(ScheduledWork work, ScheduledRunState state, SurveySettings settings)
        {
            var page = Read(work, state.LastCustomerId);
            var keys = page.CustomerIds.ToDictionary(customerId => customerId, customerId => DedupeKey.ForSchedule(work.Trigger.Setup.Id, customerId, work.Period.Key));
            var existing = _deps.ScheduledInvitations.FindExistingDedupeKeys(work.Trigger.Setup.Id, work.Period.Key, keys.Values.ToList());
            var counts = Send(work, keys.Where(key => !existing.Contains(key.Value)).ToList(), settings);
            return new ScheduledPage(Advance(state, page, counts), existing.Count, page.CustomerIds.Count);
        }

        private CustomerPage Read(ScheduledWork work, Guid? afterCustomerId)
        {
            var schedule = work.Trigger.Schedule;
            if (schedule.Population == SchedulePopulation.AllActiveCustomers) return _deps.Population.ReadActiveCustomers(afterCustomerId, PageSize);
            var query = new PopulationQuery { Source = schedule.PopulationSource, Period = work.Period, StatusValues = work.Trigger.StatusValues, TypeValues = work.Trigger.TypeValues };
            return _deps.Population.ReadCustomersActiveIn(query, afterCustomerId, PageSize);
        }

        private OneTimeCounts Send(ScheduledWork work, IReadOnlyList<KeyValuePair<Guid, string>> newCustomers, SurveySettings settings)
        {
            var counter = new OutcomeCounter(_deps.Pipeline.Invitations, _deps.Pipeline.Suppressions);
            var pipeline = counter.Around(_deps.Pipeline);
            var suppressions = new SuppressionRecorder(pipeline);
            var pinner = new FormPinner(pipeline, suppressions);
            var dispatcher = new InvitationDispatcher(pipeline, suppressions);
            foreach (var customer in newCustomers)
            {
                var candidate = pinner.Pin(EvaluationFor(work, customer.Key), PlanFor(work, customer.Value, settings));
                if (candidate != null) dispatcher.Dispatch(new[] { candidate }, settings);
            }
            return counter.Counts;
        }

        private static TriggerEvaluation EvaluationFor(ScheduledWork work, Guid customerId) =>
            new TriggerEvaluation(work.Trigger, work.Trigger.Schedule.PopulationSource, RecordChange.ForScheduledCustomer(customerId));

        // Scheduled invitations have no request, so they use the setup's Digital delivery and the period's fixed expiry.
        private static InvitationPlanRequest PlanFor(ScheduledWork work, string dedupeKey, SurveySettings settings) => new InvitationPlanRequest
        {
            Delivery = work.Trigger.Setup.DeliveryDigital,
            Key = new InvitationKey(dedupeKey, new ScheduledSlot(work.Period.Key, ScheduleCalendar.FixedExpiry(work.Trigger.Schedule.Period, work.Period))),
            Settings = settings,
        };

        // A saved page always clears the failed-call count (FR-011).
        private ScheduledRunState Advance(ScheduledRunState state, CustomerPage page, OneTimeCounts counts)
        {
            var next = state.Copy();
            next.Status = page.IsLast ? ScheduledRunStatus.Sent : ScheduledRunStatus.Sending;
            next.LastCustomerId = page.LastReadId;
            next.Evaluated += page.CustomerIds.Count;
            next.Invited += counts.Invited;
            next.Postponed += counts.Postponed;
            next.Suppressed += counts.Suppressed;
            next.FailedCalls = 0;
            next.ProgressOn = _deps.Pipeline.Clock.UtcNow;
            return next;
        }
    }
}
