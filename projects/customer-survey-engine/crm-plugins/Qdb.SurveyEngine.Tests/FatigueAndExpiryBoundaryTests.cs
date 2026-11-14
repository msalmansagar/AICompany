using System;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class FatigueBoundaryTests
    {
        private const string Table = "qdb_payment_authorization_ticket";
        private const string FormCode = "srv-fatigue-boundary";
        private static readonly Guid CustomerId = new Guid("22222222-2222-2222-2222-222222222222");

        private readonly InMemorySurveyStore _store = new InMemorySurveyStore();

        public FatigueBoundaryTests()
        {
            _store.ActiveSource = new SurveySource(Guid.NewGuid(), Table, new SourceFields { CustomerLookup = "qdb_customer_name" });
            _store.Triggers.Add(new SurveyTrigger
            {
                Id = Guid.NewGuid(), Kind = TriggerKind.Event, StatusValues = CodeList.Parse("100000005"),
                Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = FormCode },
            });
            _store.PublishedVersions[FormCode + "|en"] = 1;
            _store.CurrentRecord = new RecordChange { OldStatus = "1", NewStatus = "100000005", CustomerId = CustomerId };
            // Settings default: FatigueMinDays = 30
        }

        private void Handle() =>
            SurveyTriggerService.Compose(_store.AsDependencies())
                .Handle(new RecordChange { Message = ChangeMessage.Update, TableLogicalName = Table, RecordId = Guid.NewGuid() });

        /// <summary>
        /// FatiguePolicy.BlockingSince returns nowUtc - FatigueMinDays.
        /// HasSentInvitationSince checks i.GeneratedOn >= sinceUtc.
        /// An invitation sent at exactly nowUtc - 30 days equals sinceUtc → still inside the window.
        /// </summary>
        [Fact]
        public void Handle_SurveyedExactlyAtFatigueMinDaysAgo_IsStillFatigued()
        {
            _store.Invitations.Add(new InvitationDraft
            {
                CustomerId = CustomerId,
                GeneratedOn = _store.UtcNow.AddDays(-_store.Settings.FatigueMinDays), // exactly at boundary
                Status = InvitationStatus.Pending,
                DedupeKey = "boundary-earlier",
            });

            Handle();

            Assert.Equal(SuppressionReason.Fatigue, _store.Suppressions.Single().Reason);
        }

        [Fact]
        public void Handle_SurveyedOneDayBeforeFatigueMinDaysAgo_FatigueIsOver()
        {
            _store.Invitations.Add(new InvitationDraft
            {
                CustomerId = CustomerId,
                GeneratedOn = _store.UtcNow.AddDays(-(_store.Settings.FatigueMinDays + 1)),
                Status = InvitationStatus.Pending,
                DedupeKey = "boundary-earlier",
            });

            Handle();

            // Should generate a new invitation with no fatigue suppression
            Assert.Equal(2, _store.Invitations.Count);
            Assert.Empty(_store.Suppressions);
        }

        [Fact]
        public void Handle_PostponedInvitationWithinFatigueWindow_IsNotCountedAsFatigue()
        {
            // Postponed invitations were never sent, so they do not block the customer
            _store.Invitations.Add(new InvitationDraft
            {
                CustomerId = CustomerId,
                GeneratedOn = _store.UtcNow.AddDays(-1),
                Status = InvitationStatus.Postponed,
                DedupeKey = "postponed-earlier",
            });

            Handle();

            Assert.Empty(_store.Suppressions);
            Assert.Equal(2, _store.Invitations.Count);
        }
    }

    public class TokenExpiryBoundaryTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryIntegrationStore _store = new InMemoryIntegrationStore();
        private readonly InvitationRecord _invitation;

        public TokenExpiryBoundaryTests()
        {
            _invitation = new InvitationRecord
            {
                Id = Guid.NewGuid(), CustomerId = Guid.NewGuid(), SetupId = Guid.NewGuid(),
                FormCode = "test", PinnedVersion = 1, LanguageCode = "en",
                Status = InvitationStatus.Pending,
            };
            _store.Invitations[_invitation.Id] = _invitation;
        }

        private InvitationAccess Access() =>
            new InvitationAccess(new IntegrationDependencies { Invitations = _store, Forms = _store, Responses = _store, Config = _pipeline, Clock = _pipeline });

        private string CodeOf(Action action) => Assert.Throws<SurveyApiException>(action).Code;

        private InvitationRequest ForCustomer() =>
            new InvitationRequest { InvitationId = _invitation.Id, CallerCustomerId = _invitation.CustomerId };

        /// <summary>
        /// EnsureOpen uses ExpiresOn.Value &lt;= UtcNow: when ExpiresOn equals UtcNow exactly,
        /// the invitation has just expired (boundary inclusive on the expired side).
        /// </summary>
        [Fact]
        public void EnsureOpen_ExpiresOnEqualsNow_IsExpired()
        {
            _invitation.ExpiresOn = _pipeline.UtcNow; // exactly now

            Assert.Equal(SurveyApiException.Expired, CodeOf(() => Access().Open(ForCustomer())));
        }

        [Fact]
        public void EnsureOpen_ExpiresOnOneSecondAfterNow_IsStillOpen()
        {
            _invitation.ExpiresOn = _pipeline.UtcNow.AddSeconds(1);

            var result = Access().Open(ForCustomer());

            Assert.Equal(_invitation.Id, result.Id);
        }

        [Fact]
        public void EnsureOpen_NoExpiresOn_NeverExpires()
        {
            _invitation.ExpiresOn = null;

            var result = Access().Open(ForCustomer());

            Assert.Equal(_invitation.Id, result.Id);
        }

        [Fact]
        public void EnsureOpen_TokenUsedOnSet_IsAlreadySubmitted()
        {
            _invitation.TokenUsedOn = _pipeline.UtcNow.AddDays(-1);

            Assert.Equal(SurveyApiException.AlreadySubmitted, CodeOf(() => Access().Open(ForCustomer())));
        }
    }
}
