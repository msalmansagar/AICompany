using System;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>Whether a scheduled run may send at all, and why not.</summary>
    public sealed class SendCheck
    {
        private SendCheck(bool isSendable, string reason)
        {
            IsSendable = isSendable;
            Reason = reason;
        }

        public bool IsSendable { get; }

        /// <summary>Why the run sends nothing; empty when it is sendable.</summary>
        public string Reason { get; }

        public static SendCheck Sendable() => new SendCheck(true, string.Empty);

        public static SendCheck Refused(string reason) => new SendCheck(false, reason);
    }

    /// <summary>
    /// Trigger-wide checks made once when a scheduled run starts (FR-CSE-031..033): outside the setup's active window
    /// or Digital delivery None. Each is logged once, without a customer, instead of once per customer.
    /// </summary>
    public sealed class ScheduledRunChecks
    {
        private readonly SurveyTriggerDependencies _pipeline;
        private readonly SuppressionRecorder _suppressions;

        public ScheduledRunChecks(SurveyTriggerDependencies pipeline, SuppressionRecorder suppressions)
        {
            _pipeline = pipeline ?? throw new ArgumentNullException(nameof(pipeline));
            _suppressions = suppressions ?? throw new ArgumentNullException(nameof(suppressions));
        }

        /// <summary>Checks the trigger and logs the reason when it may not send.</summary>
        public SendCheck Check(SurveyTrigger trigger)
        {
            var evaluation = new TriggerEvaluation(trigger, trigger.Schedule.PopulationSource, new RecordChange());
            if (!ActiveWindow.IsOpen(trigger.Setup, _pipeline.Clock.UtcNow))
                return Refuse(evaluation, SuppressionReason.OutsideWindow, "Scheduled run: today is outside the setup's active window.");
            if (trigger.Setup.DeliveryDigital == DeliveryChoice.None)
                return Refuse(evaluation, SuppressionReason.ChannelNone, "Scheduled run: the setup's Digital delivery is None.");
            return SendCheck.Sendable();
        }

        private SendCheck Refuse(TriggerEvaluation evaluation, SuppressionReason reason, string detail)
        {
            _suppressions.Record(evaluation, reason, detail);
            return SendCheck.Refused(detail);
        }
    }
}
