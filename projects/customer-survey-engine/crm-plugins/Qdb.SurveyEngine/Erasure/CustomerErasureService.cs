using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Erasure
{
    /// <summary>
    /// Orchestrates DSAR right-to-erasure for one customer (C.3.2, FR-CSE-081). Finds all survey
    /// data, captures counts before mutation, then deletes or anonymises per mode within the time
    /// budget. Idempotent: a re-run on an already-erased customer returns zeros. A budget-cut live
    /// run returns IsComplete = false; re-invoke until true (C.3.5, NFR-CSE-012).
    /// </summary>
    public sealed class CustomerErasureService
    {
        private readonly ICustomerSurveyDataRepository _repo;
        private readonly IResponseRetentionStore _responseStore;
        private readonly IClock _clock;
        private readonly IErasureTraceWriter _erasureLog;

        public CustomerErasureService(
            ICustomerSurveyDataRepository repo,
            IResponseRetentionStore responseStore,
            IClock clock,
            IErasureTraceWriter erasureLog)
        {
            _repo = repo ?? throw new ArgumentNullException(nameof(repo));
            _responseStore = responseStore ?? throw new ArgumentNullException(nameof(responseStore));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _erasureLog = erasureLog ?? throw new ArgumentNullException(nameof(erasureLog));
        }

        /// <summary>Wires the concrete CRM-backed implementations.</summary>
        public static CustomerErasureService Compose(
            IOrganizationService service,
            CustomerLink customer,
            IClock clock,
            IErasureTraceWriter erasureLog)
        {
            return new CustomerErasureService(
                new CustomerSurveyDataRepository(service, customer),
                new ResponseRetentionStore(service, customer),
                clock,
                erasureLog);
        }

        /// <summary>
        /// Finds all of the customer's survey data, then — unless dry-run — erases it per mode.
        /// Writes one durable audit row on every live execution (OQ-C1 Option B).
        /// </summary>
        public ErasureCounts Erase(ErasureRequest request, RunBudget budget)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            if (budget == null) throw new ArgumentNullException(nameof(budget));

            var sets = FindAllData(request.CustomerId);
            if (request.DryRun) return sets.ToDryCounts();

            var counts = request.Mode == ErasureMode.Delete
                ? ExecuteDelete(sets, request.CustomerId, budget)
                : ExecuteAnonymise(sets, budget);

            _erasureLog.Write(BuildRecord(request, counts));
            return counts;
        }

        private ErasureDataSets FindAllData(Guid customerId)
        {
            var invitations = _repo.FindInvitations(customerId);
            var responses = _repo.FindResponses(customerId);
            var answers = _repo.FindAnswers(responses);
            var suppressionLogs = _repo.FindSuppressionLogs(customerId);
            return new ErasureDataSets(invitations, responses, answers, suppressionLogs);
        }

        /// <summary>
        /// Delete mode (C.3.4): delete invitations (cascade removes their responses and answers),
        /// delete any residual responses still carrying the customer lookup, delete suppression logs.
        /// </summary>
        private ErasureCounts ExecuteDelete(ErasureDataSets sets, Guid customerId, RunBudget budget)
        {
            var invDone = BudgetedDeletion.Run(sets.Invitations, _repo.DeleteInvitation, budget, out bool invComplete);
            if (!invComplete) return LiveCounts(invDone, sets.Responses.Count, sets.Answers.Count, 0, false);

            // Defensive: delete responses with no invitation link that the cascade did not reach.
            foreach (var id in _repo.FindResidualResponses(customerId)) _repo.DeleteResponse(id);

            var supDone = BudgetedDeletion.Run(sets.SuppressionLogs, _repo.DeleteSuppressionLog, budget, out bool supComplete);
            return LiveCounts(invDone, sets.Responses.Count, sets.Answers.Count, supDone, supComplete);
        }

        /// <summary>
        /// Anonymise mode (C.3.4): anonymise responses FIRST (severing the cascade link), THEN
        /// delete invitations (cascade no longer reaches the now-unlinked responses), then delete
        /// suppression logs. Ordering is correctness-critical (ADR-008 R2).
        /// </summary>
        private ErasureCounts ExecuteAnonymise(ErasureDataSets sets, RunBudget budget)
        {
            var respDone = BudgetedDeletion.Run(sets.Responses, _responseStore.Anonymise, budget, out bool respComplete);
            if (!respComplete) return LiveCounts(0, respDone, sets.Answers.Count, 0, false);

            var invDone = BudgetedDeletion.Run(sets.Invitations, _repo.DeleteInvitation, budget, out bool invComplete);
            if (!invComplete) return LiveCounts(invDone, respDone, sets.Answers.Count, 0, false);

            var supDone = BudgetedDeletion.Run(sets.SuppressionLogs, _repo.DeleteSuppressionLog, budget, out bool supComplete);
            return LiveCounts(invDone, respDone, sets.Answers.Count, supDone, supComplete);
        }

        private static ErasureCounts LiveCounts(int inv, int resp, int ans, int sup, bool isComplete) =>
            new ErasureCounts { InvitationCount = inv, ResponseCount = resp, AnswerCount = ans, SuppressionLogCount = sup, AreActual = true, IsComplete = isComplete };

        private ErasureRecord BuildRecord(ErasureRequest request, ErasureCounts counts) =>
            new ErasureRecord
            {
                InitiatingUserId = request.InitiatingUserId,
                CustomerId = request.CustomerId,
                Mode = request.Mode,
                DryRun = request.DryRun,
                InvitationCount = counts.InvitationCount,
                ResponseCount = counts.ResponseCount,
                AnswerCount = counts.AnswerCount,
                SuppressionLogCount = counts.SuppressionLogCount,
                AreActual = counts.AreActual,
                IsComplete = counts.IsComplete,
                ExecutedOnUtc = _clock.UtcNow,
            };
    }

    /// <summary>All survey data found for one customer before any mutation (counts captured pre-mutation, C.3.4).</summary>
    internal sealed class ErasureDataSets
    {
        public ErasureDataSets(
            IReadOnlyList<Guid> invitations,
            IReadOnlyList<Guid> responses,
            IReadOnlyList<Guid> answers,
            IReadOnlyList<Guid> suppressionLogs)
        {
            Invitations = invitations;
            Responses = responses;
            Answers = answers;
            SuppressionLogs = suppressionLogs;
        }

        public IReadOnlyList<Guid> Invitations { get; }
        public IReadOnlyList<Guid> Responses { get; }
        public IReadOnlyList<Guid> Answers { get; }
        public IReadOnlyList<Guid> SuppressionLogs { get; }

        public ErasureCounts ToDryCounts() => new ErasureCounts
        {
            InvitationCount = Invitations.Count,
            ResponseCount = Responses.Count,
            AnswerCount = Answers.Count,
            SuppressionLogCount = SuppressionLogs.Count,
            AreActual = false,
            IsComplete = true,
        };
    }
}
