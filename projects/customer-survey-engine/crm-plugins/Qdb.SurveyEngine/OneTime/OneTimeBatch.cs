using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.OneTime
{
    /// <summary>
    /// What every customer of one Send call shares: the trigger, the settings, and the dedupe keys the
    /// trigger already generated (read once per call, so a resumed page skips customers already invited).
    /// </summary>
    internal sealed class OneTimeBatch
    {
        private readonly SurveyTrigger _trigger;
        private readonly ISet<string> _generatedKeys;
        private readonly string _periodKey;

        public OneTimeBatch(SurveyTrigger trigger, SurveySettings settings, ISet<string> generatedKeys)
        {
            _trigger = trigger ?? throw new ArgumentNullException(nameof(trigger));
            Settings = settings ?? throw new ArgumentNullException(nameof(settings));
            _generatedKeys = generatedKeys ?? new HashSet<string>();
            _periodKey = DedupeKey.OneTimePeriodKey(trigger.Id);
        }

        public SurveySettings Settings { get; }

        /// <summary>True when this trigger already created the customer's invitation (Pending or Postponed).</summary>
        public bool WasGenerated(Guid customerId) => _generatedKeys.Contains(KeyFor(customerId));

        /// <summary>A sourceless evaluation of the customer, as scheduled triggers use.</summary>
        public TriggerEvaluation EvaluationFor(Guid customerId) => new TriggerEvaluation(_trigger, null, RecordChange.ForScheduledCustomer(customerId));

        /// <summary>The setup's Digital delivery (no request marks it Legacy) and expiry from creation (FR-CSE-087, 088).</summary>
        public InvitationPlanRequest PlanFor(Guid customerId) => new InvitationPlanRequest
        {
            Delivery = _trigger.Setup.DeliveryDigital,
            Key = new InvitationKey(KeyFor(customerId), new ScheduledSlot(_periodKey, null)),
            Settings = Settings,
        };

        private string KeyFor(Guid customerId) => DedupeKey.ForOneTime(_trigger.Setup.Id, customerId, _trigger.Id);
    }

    /// <summary>Either the audience query to send to, or why the trigger cannot be sent.</summary>
    internal sealed class SendPlan
    {
        private SendPlan(AudienceQuery query, string problem)
        {
            Query = query;
            Problem = problem;
        }

        public AudienceQuery Query { get; }

        /// <summary>Why the send fails; null when <see cref="Query"/> is set.</summary>
        public string Problem { get; }

        public static SendPlan For(AudienceQuery query) => new SendPlan(query ?? throw new ArgumentNullException(nameof(query)), null);

        public static SendPlan Refused(string problem) => new SendPlan(null, problem);
    }
}
