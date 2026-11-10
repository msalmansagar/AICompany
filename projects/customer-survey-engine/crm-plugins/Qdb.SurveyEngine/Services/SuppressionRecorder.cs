using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>Writes a suppression-log row for an evaluated trigger and traces it (NFR-CSE-001).</summary>
    public sealed class SuppressionRecorder
    {
        private readonly SurveyTriggerDependencies _deps;

        public SuppressionRecorder(SurveyTriggerDependencies dependencies)
        {
            _deps = dependencies;
        }

        /// <summary>Records why this trigger sent nothing.</summary>
        public void Record(TriggerEvaluation evaluation, SuppressionReason reason, string detail)
        {
            _deps.Suppressions.Write(new SuppressionEntry
            {
                Reason = reason,
                CustomerId = evaluation.Change.CustomerId,
                TriggerId = evaluation.Trigger.Id,
                SetupId = evaluation.Trigger.Setup.Id,
                SourceTable = evaluation.Change.TableLogicalName,
                SourceRecordId = evaluation.Change.RecordId,
                Detail = detail,
                LoggedOn = _deps.Clock.UtcNow,
            });
            _deps.Trace.Write($"Suppressed ({reason}): {detail}");
        }
    }
}
