using Qdb.DebtCollection.Plugins.Domain;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// Verifies the Build-step-1 decision 3 matrix expansion (2026-09-16):
    /// Deceased/Insurance Review is now reachable from every non-terminal case state.
    /// Tests exercise <see cref="StatusTransitionMatrix.IsCaseTransitionAllowed"/> directly.
    /// </summary>
    public sealed class StatusTransitionMatrixDeceasedTests
    {
        // ── Every non-terminal, non-deceased state may reach DeceasedInsuranceReview ─

        [Theory]
        [InlineData(StatusTransitionMatrix.CaseStatus.New)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Assigned)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PendingCustomerResponse)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PtpActive)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PtpBroken)]
        [InlineData(StatusTransitionMatrix.CaseStatus.RestructureReview)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Restructured)]
        [InlineData(StatusTransitionMatrix.CaseStatus.EscalatedToSupervisor)]
        [InlineData(StatusTransitionMatrix.CaseStatus.PendingLegalReview)]
        [InlineData(StatusTransitionMatrix.CaseStatus.ReferredToLegal)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Reopened)]
        public void IsCaseTransitionAllowed_FromAnyNonTerminalState_ToDeceasedInsuranceReview_ReturnsTrue(
            int fromCode)
        {
            // Act
            var result = StatusTransitionMatrix.IsCaseTransitionAllowed(
                fromCode,
                StatusTransitionMatrix.CaseStatus.DeceasedInsuranceReview);

            // Assert
            Assert.True(result, $"Expected transition from {fromCode} to DeceasedInsuranceReview to be allowed.");
        }

        // ── Terminal states may NOT reach DeceasedInsuranceReview ────────────────────

        [Theory]
        [InlineData(StatusTransitionMatrix.CaseStatus.UnderLegalAction)]
        [InlineData(StatusTransitionMatrix.CaseStatus.DeceasedInsuranceReview)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Settled)]
        [InlineData(StatusTransitionMatrix.CaseStatus.Closed)]
        [InlineData(StatusTransitionMatrix.CaseStatus.WrittenOff)]
        public void IsCaseTransitionAllowed_FromTerminalState_ToDeceasedInsuranceReview_ReturnsFalse(
            int fromCode)
        {
            // Act
            var result = StatusTransitionMatrix.IsCaseTransitionAllowed(
                fromCode,
                StatusTransitionMatrix.CaseStatus.DeceasedInsuranceReview);

            // Assert
            Assert.False(result, $"Expected transition from {fromCode} to DeceasedInsuranceReview to be refused.");
        }

        // ── The expansion must not have widened anything else ─────────────────

        [Fact]
        public void IsCaseTransitionAllowed_New_ToInProgress_StillRefused()
        {
            // Act - New may only reach Assigned or the escape hatch
            var result = StatusTransitionMatrix.IsCaseTransitionAllowed(
                StatusTransitionMatrix.CaseStatus.New,
                StatusTransitionMatrix.CaseStatus.InProgress);

            // Assert
            Assert.False(result);
        }

        [Fact]
        public void IsCaseTransitionAllowed_Reopened_ToInProgress_StillAllowed()
        {
            // Act - the Reopened entry moved in the map; its original target must survive
            var result = StatusTransitionMatrix.IsCaseTransitionAllowed(
                StatusTransitionMatrix.CaseStatus.Reopened,
                StatusTransitionMatrix.CaseStatus.InProgress);

            // Assert
            Assert.True(result);
        }
    }
}