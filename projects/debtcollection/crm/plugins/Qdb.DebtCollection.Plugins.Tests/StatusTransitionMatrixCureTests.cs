using Qdb.DebtCollection.Plugins.Domain;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// Settled as a universal target (Phase 2, 2026-09-18). MIS reports a cure whenever the customer
    /// pays; a case in any working state must then be able to reach Settled and, from there, Closed.
    /// </summary>
    public sealed class StatusTransitionMatrixCureTests
    {
        [Theory]
        [InlineData(StatusTransitionMatrix.CaseStatus.New)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Assigned)]
        [InlineData(StatusTransitionMatrix.CaseStatus.InProgress)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PendingCustomerResponse)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PtpActive)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PtpBroken)]
        [InlineData(StatusTransitionMatrix.CaseStatus.RestructureReview)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Restructured)]
        [InlineData(StatusTransitionMatrix.CaseStatus.EscalatedToSupervisor)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PendingLegalReview)]
        [InlineData(StatusTransitionMatrix.CaseStatus.ReferredToLegal)]
        [InlineData(StatusTransitionMatrix.CaseStatus.UnderLegalAction)]
        [InlineData(StatusTransitionMatrix.CaseStatus.DeceasedInsuranceReview)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Reopened)]
        public void IsCaseTransitionAllowed_FromEveryNonTerminalState_ToSettled_IsAllowed(int fromCode)
        {
            Assert.True(StatusTransitionMatrix.IsCaseTransitionAllowed(fromCode, StatusTransitionMatrix.CaseStatus.Settled));
        }

        [Theory]
        [InlineData(StatusTransitionMatrix.CaseStatus.Closed)]
        [InlineData(StatusTransitionMatrix.CaseStatus.WrittenOff)]
        public void IsCaseTransitionAllowed_FromTerminalState_ToSettled_IsRefused(int fromCode)
        {
            Assert.False(StatusTransitionMatrix.IsCaseTransitionAllowed(fromCode, StatusTransitionMatrix.CaseStatus.Settled));
        }

        [Fact]
        public void IsCaseTransitionAllowed_SettledToClosed_CompletesTheCurePath()
        {
            Assert.True(StatusTransitionMatrix.IsCaseTransitionAllowed(
                StatusTransitionMatrix.CaseStatus.Settled, StatusTransitionMatrix.CaseStatus.Closed));
        }
    }
}
