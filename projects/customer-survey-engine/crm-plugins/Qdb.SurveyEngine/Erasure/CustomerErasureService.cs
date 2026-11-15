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
    ///
    /// SEC-001: for every live run a "started" log row is written BEFORE any mutation so that
    /// evidence of the erasure attempt exists even if the run is interrupted. A "completed" row is
    /// written after. For dry runs (SEC-002) a single log row is written with the found counts.
    /// </summary>
    public sealed class CustomerErasureService
    {
        private readonly CustomerErasureDependencies _deps;

        public CustomerErasureService(CustomerErasureDependencies dependencies)
        {
            if (dependencies == null) throw new ArgumentNullException(nameof(dependencies));
            if (dependencies.Repo == null) throw new ArgumentException("Repo is required.", nameof(dependencies));
            if (dependencies.ResponseStore == null) throw new ArgumentException("ResponseStore is required.", nameof(dependencies));
            if (dependencies.Clock == null) throw new ArgumentException("Clock is required.", nameof(dependencies));
            if (dependencies.ErasureLog == null) throw new ArgumentException("ErasureLog is required.", nameof(dependencies));
            _deps = dependencies;
        }

        /// <summary>Wires the concrete CRM-backed implementations (ErasureLogWriter is built internally).</summary>
        public static CustomerErasureService Compose(IOrganizationService service, CustomerLink customer, IClock clock)
        {
            if (service == null) throw new ArgumentNullException(nameof(service));
            return new CustomerErasureService(new CustomerErasureDependencies
            {
                Repo = new CustomerSurveyDataRepository(service, customer),
                ResponseStore = new ResponseRetentionStore(service, customer),
                Clock = clock,
                ErasureLog = new ErasureLogWriter(service),
            });
        }

        /// <summary>
        /// Finds all of the customer's survey data, writes a log row, then — unless dry-run — erases
        /// it per mode and writes a second "completed" row. The "started" row is written before any
        /// mutation; if that write fails nothing is erased (SEC-001).
        /// </summary>
        public ErasureCounts Erase(ErasureRequest request, RunBudget budget)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            if (budget == null) throw new ArgumentNullException(nameof(budget));

            var sets = FindAllData(request.CustomerId);

            if (request.DryRun)
            {
                // SEC-002: write a dry-run record (AreActual=false, found counts) before returning.
                _deps.ErasureLog.Write(BuildRecord(request, sets.ToDryCounts()));
                return sets.ToDryCounts();
            }

            // SEC-001: write "started" row (found counts, AreActual=false, IsComplete=false).
            // If this write fails, the exception propagates here and no mutation occurs.
            _deps.ErasureLog.Write(BuildRecord(request, sets.ToStartedCounts()));

            var counts = request.Mode == ErasureMode.Delete
                ? ExecuteDelete(sets, request.CustomerId, budget)
                : ExecuteAnonymise(sets, budget);

            // SEC-001: write "completed" row (actual counts, AreActual=true).
            _deps.ErasureLog.Write(BuildRecord(request, counts));
            return counts;
        }

        private ErasureDataSets FindAllData(Guid customerId)
        {
            var invitations = _deps.Repo.FindInvitations(customerId);
            var responses = _deps.Repo.FindResponses(customerId);
            var answers = _deps.Repo.FindAnswers(responses);
            var suppressionLogs = _deps.Repo.FindSuppressionLogs(customerId);
            return new ErasureDataSets
            {
                Invitations = invitations,
                Responses = responses,
                Answers = answers,
                SuppressionLogs = suppressionLogs,
            };
        }

        /// <summary>
        /// Delete mode (C.3.4): delete invitations (cascade removes their responses and answers),
        /// delete any residual responses still carrying the customer lookup, delete suppression logs.
        /// Every step runs through BudgetedDeletion so the time limit is respected.
        /// </summary>
        private ErasureCounts ExecuteDelete(ErasureDataSets sets, Guid customerId, RunBudget budget)
        {
            var invDone = BudgetedDeletion.Run(sets.Invitations, _deps.Repo.DeleteInvitation, budget, out bool invComplete);
            if (!invComplete) return LiveCounts(invDone, sets.Responses.Count, sets.Answers.Count, 0, false);

            // Defensive: delete responses with no invitation link that the cascade did not reach.
            var residual = _deps.Repo.FindResidualResponses(customerId);
            BudgetedDeletion.Run(residual, _deps.Repo.DeleteResponse, budget, out bool residualComplete);
            if (!residualComplete) return LiveCounts(invDone, sets.Responses.Count, sets.Answers.Count, 0, false);

            var supDone = BudgetedDeletion.Run(sets.SuppressionLogs, _deps.Repo.DeleteSuppressionLog, budget, out bool supComplete);
            return LiveCounts(invDone, sets.Responses.Count, sets.Answers.Count, supDone, supComplete);
        }

        /// <summary>
        /// Anonymise mode (C.3.4): anonymise responses FIRST (severing the cascade link), THEN
        /// delete invitations (cascade no longer reaches the now-unlinked responses), then delete
        /// suppression logs. Ordering is correctness-critical (ADR-008 R2).
        /// </summary>
        private ErasureCounts ExecuteAnonymise(ErasureDataSets sets, RunBudget budget)
        {
            var respDone = BudgetedDeletion.Run(sets.Responses, _deps.ResponseStore.Anonymise, budget, out bool respComplete);
            if (!respComplete) return LiveCounts(0, respDone, sets.Answers.Count, 0, false);

            var invDone = BudgetedDeletion.Run(sets.Invitations, _deps.Repo.DeleteInvitation, budget, out bool invComplete);
            if (!invComplete) return LiveCounts(invDone, respDone, sets.Answers.Count, 0, false);

            var supDone = BudgetedDeletion.Run(sets.SuppressionLogs, _deps.Repo.DeleteSuppressionLog, budget, out bool supComplete);
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
                ExecutedOnUtc = _deps.Clock.UtcNow,
            };
    }

    /// <summary>All survey data found for one customer before any mutation (counts captured pre-mutation, C.3.4).</summary>
    internal sealed class ErasureDataSets
    {
        public IReadOnlyList<Guid> Invitations { get; set; } = new List<Guid>();
        public IReadOnlyList<Guid> Responses { get; set; } = new List<Guid>();
        public IReadOnlyList<Guid> Answers { get; set; } = new List<Guid>();
        public IReadOnlyList<Guid> SuppressionLogs { get; set; } = new List<Guid>();

        /// <summary>Dry-run result: found counts, AreActual=false, IsComplete=true.</summary>
        public ErasureCounts ToDryCounts() => new ErasureCounts
        {
            InvitationCount = Invitations.Count,
            ResponseCount = Responses.Count,
            AnswerCount = Answers.Count,
            SuppressionLogCount = SuppressionLogs.Count,
            AreActual = false,
            IsComplete = true,
        };

        /// <summary>Started-row counts: found counts, AreActual=false, IsComplete=false (mutation not yet complete).</summary>
        public ErasureCounts ToStartedCounts() => new ErasureCounts
        {
            InvitationCount = Invitations.Count,
            ResponseCount = Responses.Count,
            AnswerCount = Answers.Count,
            SuppressionLogCount = SuppressionLogs.Count,
            AreActual = false,
            IsComplete = false,
        };
    }
}
