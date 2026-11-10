using System;
using System.Linq;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>
    /// Turns one source-record change into invitations or suppression-log rows (section 6.3).
    /// Per-trigger checks run in <see cref="CandidatePreparer"/>; fatigue and priority across the
    /// surviving triggers run in <see cref="InvitationDispatcher"/>. Every firing trigger ends in an
    /// invitation (Pending or Postponed) or a suppression row (NFR-CSE-001); a milestone trigger
    /// that reached no new index is the one exception, and is traced instead.
    /// </summary>
    public sealed class SurveyTriggerService
    {
        private readonly SurveyTriggerDependencies _deps;
        private readonly CandidatePreparer _preparer;
        private readonly InvitationDispatcher _dispatcher;

        /// <summary>Creates the service from its collaborators; see <see cref="Compose"/> for the usual wiring.</summary>
        public SurveyTriggerService(SurveyTriggerDependencies dependencies, CandidatePreparer preparer, InvitationDispatcher dispatcher)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _preparer = preparer ?? throw new ArgumentNullException(nameof(preparer));
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
        }

        /// <summary>The composition root's wiring: validates every dependency and builds the service graph.</summary>
        public static SurveyTriggerService Compose(SurveyTriggerDependencies dependencies)
        {
            if (dependencies == null) throw new ArgumentNullException(nameof(dependencies));
            if (dependencies.Config == null || dependencies.Records == null || dependencies.Languages == null || dependencies.RenderCache == null || dependencies.Milestones == null
                || dependencies.Invitations == null || dependencies.Suppressions == null || dependencies.Clock == null || dependencies.Trace == null)
                throw new ArgumentException("Every SurveyTriggerDependencies member is required.", nameof(dependencies));
            var suppressions = new SuppressionRecorder(dependencies);
            return new SurveyTriggerService(dependencies, new CandidatePreparer(dependencies, suppressions), new InvitationDispatcher(dependencies, suppressions));
        }

        /// <summary>Evaluates every active trigger of the change's source table.</summary>
        public void Handle(RecordChange change)
        {
            var source = _deps.Config.FindActiveSource(change.TableLogicalName);
            if (source == null)
            {
                _deps.Trace.Write($"{change.TableLogicalName} is not an active survey source; nothing to do.");
                return;
            }
            var current = _deps.Records.ReadCurrent(source, change);
            var firing = _deps.Config.GetActiveRecordTriggers(source.Id).Where(t => TriggerMatcher.Matches(t, current)).ToList();
            _deps.Trace.Write($"{firing.Count} trigger(s) fire for {current.TableLogicalName} {current.RecordId:D} ({current.OldStatus ?? "-"} -> {current.NewStatus ?? "-"}).");
            if (firing.Count == 0) return;
            var settings = _deps.Config.GetSettings();
            var candidates = firing.Select(t => _preparer.Prepare(new TriggerEvaluation(t, source, current), settings)).Where(c => c != null).ToList();
            _dispatcher.Dispatch(candidates, settings);
        }
    }
}
