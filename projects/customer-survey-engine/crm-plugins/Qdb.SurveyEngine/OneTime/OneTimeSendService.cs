using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.OneTime
{
    /// <summary>
    /// Sends a One-time trigger (FR-CSE-083..088, ADR-010): page by page through its audience, each
    /// customer through the same rules as every invitation (version pin, fatigue with Drop / Postpone,
    /// priority, the setup's Digital delivery). The cursor and totals are committed after each page and
    /// the call stops between pages when the budget runs out, so the form or the scheduler can call
    /// again and the send resumes where it stopped. A trigger runs once.
    /// </summary>
    public sealed class OneTimeSendService
    {
        /// <summary>About 6 seconds of work per page at the A3-measured rate, so a page never outruns the budget.</summary>
        public const int PageSize = 100;

        private readonly OneTimeSendDependencies _deps;

        public OneTimeSendService(OneTimeSendDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            var pipeline = _deps.Pipeline;
            if (pipeline?.Config == null || pipeline.Languages == null || pipeline.RenderCache == null || pipeline.Invitations == null
                || pipeline.Suppressions == null || pipeline.Clock == null || pipeline.Trace == null)
                throw new ArgumentException("Pipeline needs Config, Languages, RenderCache, Invitations, Suppressions, Clock and Trace.", nameof(dependencies));
            if (_deps.Triggers == null || _deps.Audience == null || _deps.GeneratedKeys == null || string.IsNullOrWhiteSpace(_deps.CustomerTable))
                throw new ArgumentException("Triggers, Audience, GeneratedKeys and CustomerTable are required.", nameof(dependencies));
        }

        /// <summary>How many customers the trigger's audience holds now (FR-CSE-084).</summary>
        public int Preview(Guid triggerId)
        {
            var trigger = FindOneTime(triggerId);
            try
            {
                return _deps.Audience.Count(BuildQuery(trigger));
            }
            catch (AudienceFilterException invalid)
            {
                throw new OneTimeSendRefusedException(invalid.Message);
            }
        }

        /// <summary>Sends the trigger, or continues its send, within the budget.</summary>
        public OneTimeSendResult Send(Guid triggerId, RunBudget budget)
        {
            if (budget == null) throw new ArgumentNullException(nameof(budget));
            var trigger = FindOneTime(triggerId);
            RefuseUnsendable(trigger);
            var plan = PlanSend(trigger);
            if (plan.Problem != null) return Failed(trigger, plan.Problem);
            var claim = Claim(trigger);
            if (!claim.IsSaved) return SentElsewhere(trigger.Run.Counts);
            return SendPages(trigger, StartingState(trigger.Run, claim.RowVersion), new SendLoop(plan.Query, budget));
        }

        private OneTimeTrigger FindOneTime(Guid triggerId) =>
            _deps.Triggers.Find(triggerId) ?? throw new OneTimeSendRefusedException($"Trigger {triggerId:D} does not exist or is not a One-time trigger.");

        private static void RefuseUnsendable(OneTimeTrigger trigger)
        {
            var run = trigger.Run;
            if (run.Status == OneTimeRunStatus.Sent)
                throw new OneTimeSendRefusedException($"This survey was already sent on {run.SentOn:yyyy-MM-dd HH:mm} UTC ({run.Counts}). Copy the trigger to send it again.");
            if (run.Status == OneTimeRunStatus.Failed && HasSentAnything(run))
                throw new OneTimeSendRefusedException($"This send failed after part of the audience was reached ({run.Counts}). Copy the trigger to send to the rest.");
            if (!trigger.IsTriggerActive) throw new OneTimeSendRefusedException("Switch the trigger on (Is Active) before sending.");
            if (!trigger.IsSetupActive) throw new OneTimeSendRefusedException("Switch the survey setup on (Is Active) before sending.");
        }

        private static bool HasSentAnything(OneTimeRunState run) => run.Counts.Invited + run.Counts.Postponed + run.Counts.Suppressed > 0;

        // A trigger-wide problem fails the send once, instead of logging every customer (as scheduled triggers do).
        private SendPlan PlanSend(OneTimeTrigger trigger)
        {
            var setup = trigger.Trigger.Setup;
            if (!ActiveWindow.IsOpen(setup, _deps.Pipeline.Clock.UtcNow)) return SendPlan.Refused("Today is outside the survey setup's active window.");
            if (setup.DeliveryDigital == DeliveryChoice.None) return SendPlan.Refused("The survey setup's Digital delivery is None, so nobody would receive it.");
            try
            {
                return SendPlan.For(BuildQuery(trigger));
            }
            catch (AudienceFilterException invalid)
            {
                return SendPlan.Refused(invalid.Message);
            }
        }

        private AudienceQuery BuildQuery(OneTimeTrigger trigger) =>
            trigger.Audience == AudienceKind.Filter
                ? AudienceQuery.FromFetchXml(trigger.AudienceFetchXml, _deps.CustomerTable)
                : AudienceQuery.AllActive(_deps.CustomerTable);

        private OneTimeSendResult Failed(OneTimeTrigger trigger, string reason)
        {
            _deps.Triggers.Fail(trigger.Trigger.Id, reason);
            _deps.Pipeline.Trace.Write($"One-time trigger {trigger.Trigger.Id:D} failed: {reason}");
            return new OneTimeSendResult { Status = OneTimeRunStatus.Failed, Counts = trigger.Run.Counts, IsComplete = true, Message = reason };
        }

        // A resume re-writes the committed cursor conditionally, so of two callers resuming at once only one
        // goes on (review M-1). A Failed send that reached nobody starts again from the first page.
        private RunWrite Claim(OneTimeTrigger trigger) =>
            trigger.Run.Status == OneTimeRunStatus.Sending
                ? _deps.Triggers.TrySaveProgress(trigger.Trigger.Id, trigger.Run)
                : _deps.Triggers.TryStart(trigger, _deps.Pipeline.Clock.UtcNow);

        private static OneTimeRunState StartingState(OneTimeRunState run, string rowVersion) =>
            run.Status == OneTimeRunStatus.Sending ? run.WithRowVersion(rowVersion) : new OneTimeRunState { Status = OneTimeRunStatus.Sending, RowVersion = rowVersion };

        // Another run owns the send: stop without writing, and say so (the form stops calling on IsComplete).
        private static OneTimeSendResult SentElsewhere(OneTimeCounts counts) => new OneTimeSendResult
        {
            Status = OneTimeRunStatus.Sending, Counts = counts, IsComplete = true,
            Message = "Another run is sending this survey and will finish it. Refresh the form to see its progress.",
        };

        private OneTimeSendResult SendPages(OneTimeTrigger trigger, OneTimeRunState state, SendLoop loop)
        {
            var batch = new OneTimeBatch(trigger.Trigger, _deps.Pipeline.Config.GetSettings(), ReadGeneratedKeys(trigger.Trigger));
            while (!loop.Budget.IsExhausted)
            {
                var page = _deps.Audience.ReadPage(loop.Query, state.NextPage, state.PagingCookie);
                state = Advance(state, page, SendPage(batch, page.CustomerIds));
                if (!page.MoreRecords) return Complete(trigger.Trigger.Id, state);
                var write = _deps.Triggers.TrySaveProgress(trigger.Trigger.Id, state);
                if (!write.IsSaved) return SentElsewhere(state.Counts);
                state = state.WithRowVersion(write.RowVersion);
            }
            return new OneTimeSendResult { Status = OneTimeRunStatus.Sending, Counts = state.Counts, IsComplete = false };
        }

        private ISet<string> ReadGeneratedKeys(SurveyTrigger trigger) =>
            _deps.GeneratedKeys.GetDedupeKeys(trigger.Setup.Id, DedupeKey.OneTimePeriodKey(trigger.Id));

        private OneTimeCounts SendPage(OneTimeBatch batch, IReadOnlyList<Guid> customerIds)
        {
            var counter = new OutcomeCounter(_deps.Pipeline.Invitations, _deps.Pipeline.Suppressions);
            var pipeline = WithCounter(counter);
            var suppressions = new SuppressionRecorder(pipeline);
            var pinner = new FormPinner(pipeline, suppressions);
            var dispatcher = new InvitationDispatcher(pipeline, suppressions);
            foreach (var customerId in customerIds.Where(id => !batch.WasGenerated(id)))
            {
                var candidate = pinner.Pin(batch.EvaluationFor(customerId), batch.PlanFor(customerId));
                if (candidate != null) dispatcher.Dispatch(new[] { candidate }, batch.Settings);
            }
            return counter.Counts;
        }

        private SurveyTriggerDependencies WithCounter(OutcomeCounter counter)
        {
            var shared = _deps.Pipeline;
            return new SurveyTriggerDependencies
            {
                Config = shared.Config, Records = shared.Records, Languages = shared.Languages, RenderCache = shared.RenderCache,
                Milestones = shared.Milestones, Invitations = counter, Suppressions = counter, Clock = shared.Clock, Trace = shared.Trace,
            };
        }

        private static OneTimeRunState Advance(OneTimeRunState state, AudiencePage page, OneTimeCounts pageCounts) => new OneTimeRunState
        {
            Status = OneTimeRunStatus.Sending,
            NextPage = state.NextPage + 1,
            PagingCookie = page.PagingCookie,
            Counts = state.Counts.Plus(pageCounts),
            RowVersion = state.RowVersion,
        };

        private OneTimeSendResult Complete(Guid triggerId, OneTimeRunState state)
        {
            var sent = new OneTimeRunState
            {
                Status = OneTimeRunStatus.Sent, NextPage = state.NextPage, PagingCookie = state.PagingCookie, Counts = state.Counts,
                SentOn = _deps.Pipeline.Clock.UtcNow, RowVersion = state.RowVersion,
            };
            if (!_deps.Triggers.TryComplete(triggerId, sent).IsSaved) return SentElsewhere(state.Counts);
            _deps.Pipeline.Trace.Write($"One-time trigger {triggerId:D} sent: {sent.Counts}.");
            return new OneTimeSendResult { Status = OneTimeRunStatus.Sent, Counts = sent.Counts, IsComplete = true };
        }

        /// <summary>What every page of one Send call reads: the audience and the time budget.</summary>
        private sealed class SendLoop
        {
            public SendLoop(AudienceQuery query, RunBudget budget)
            {
                Query = query;
                Budget = budget;
            }

            public AudienceQuery Query { get; }
            public RunBudget Budget { get; }
        }
    }
}
