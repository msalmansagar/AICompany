using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.OneTime
{
    /// <summary>
    /// The first pass of every Run Due Surveys call (FR-CSE-085, ADR-010): sends each One-time trigger
    /// whose send time has come, and finishes any send a closed form left in Sending, oldest first,
    /// within the budget. With the scheduler every 15 minutes, a dated send goes out within 15 minutes.
    /// </summary>
    public sealed class OneTimeDuePass
    {
        private readonly IOneTimeTriggerStore _triggers;
        private readonly OneTimeSendService _sender;
        private readonly SurveyTriggerDependencies _pipeline;

        public OneTimeDuePass(IOneTimeTriggerStore triggers, OneTimeSendService sender, SurveyTriggerDependencies pipeline)
        {
            _triggers = triggers ?? throw new ArgumentNullException(nameof(triggers));
            _sender = sender ?? throw new ArgumentNullException(nameof(sender));
            _pipeline = pipeline ?? throw new ArgumentNullException(nameof(pipeline));
        }

        /// <summary>Sends what is due, as far as the budget allows.</summary>
        public OneTimeDueResult Run(RunBudget budget)
        {
            if (budget == null) throw new ArgumentNullException(nameof(budget));
            var result = new OneTimeDueResult();
            foreach (var triggerId in _triggers.GetDueTriggerIds(_pipeline.Clock.UtcNow))
            {
                if (budget.IsExhausted) { result.IsComplete = false; break; }
                result.Add(SendOne(triggerId, budget));
            }
            _pipeline.Trace.Write(result.ToString());
            return result;
        }

        // A refused trigger (e.g. switched off since it was read) must not stop the others.
        private OneTimeSendResult SendOne(Guid triggerId, RunBudget budget)
        {
            try
            {
                return _sender.Send(triggerId, budget);
            }
            catch (OneTimeSendRefusedException refused)
            {
                _pipeline.Trace.Write($"One-time trigger {triggerId:D} not sent: {refused.Message}");
                return new OneTimeSendResult { Status = Domain.OneTimeRunStatus.NotSent, IsComplete = true, Message = $"{triggerId:D}: {refused.Message}" };
            }
        }
    }

    /// <summary>What the One-time pass did in one call.</summary>
    public sealed class OneTimeDueResult
    {
        public int Triggers { get; private set; }
        public int Sent { get; private set; }
        public OneTimeCounts Counts { get; private set; } = new OneTimeCounts();
        public List<string> Problems { get; } = new List<string>();
        public bool IsComplete { get; set; } = true;

        /// <summary>Adds one trigger's result.</summary>
        public void Add(OneTimeSendResult sent)
        {
            Triggers++;
            if (sent.Status == Domain.OneTimeRunStatus.Sent) Sent++;
            Counts = Counts.Plus(sent.Counts);
            if (!sent.IsComplete) IsComplete = false;
            if (sent.Message.Length > 0) Problems.Add(sent.Message);
        }

        public override string ToString() =>
            $"One-time: {Triggers} trigger(s) due, {Sent} finished, {Counts}." + (Problems.Count > 0 ? " Problems: " + string.Join(" ", Problems) : string.Empty);
    }
}
