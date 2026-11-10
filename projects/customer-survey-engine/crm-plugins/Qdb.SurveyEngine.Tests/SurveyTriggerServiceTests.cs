using System;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class SurveyTriggerServiceTests
    {
        private const string Table = "qdb_payment_authorization_ticket";
        private const string FormCode = "srv-disbursement";
        private static readonly Guid CustomerId = new Guid("22222222-2222-2222-2222-222222222222");
        private static readonly Guid RecordId = new Guid("33333333-3333-3333-3333-333333333333");

        private readonly InMemorySurveyStore _store = new InMemorySurveyStore();

        public SurveyTriggerServiceTests()
        {
            _store.ActiveSource = new SurveySource(Guid.NewGuid(), Table, new SourceFields
            {
                CustomerLookup = "qdb_customer_name", Status = "statuscode", Origin = "qdb_source_location", DigitalOriginValues = CodeList.Parse("751090002"),
            });
            _store.Triggers.Add(new SurveyTrigger
            {
                Id = Guid.NewGuid(), Kind = TriggerKind.Event, StatusValues = CodeList.Parse("100000005"),
                Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = FormCode, DeliveryDigital = DeliveryChoice.Portal, DeliveryLegacy = DeliveryChoice.SecureLink, ExpiryDays = 14 },
            });
            _store.CurrentRecord = new RecordChange { OldStatus = "1", NewStatus = "100000005", Origin = "751090002", CustomerId = CustomerId };
            _store.PublishedVersions[FormCode + "|en"] = 3;
        }

        private void HandleStatusChange() =>
            SurveyTriggerService.Compose(_store.AsDependencies()).Handle(new RecordChange { Message = ChangeMessage.Update, TableLogicalName = Table, RecordId = RecordId });

        private SuppressionReason OnlySuppressionReason() => _store.Suppressions.Single().Reason;

        [Fact]
        public void Handle_StatusEntersSet_CreatesOnePendingInvitation()
        {
            HandleStatusChange();

            var invitation = _store.Invitations.Single();
            Assert.Equal(InvitationStatus.Pending, invitation.Status);
            Assert.Empty(_store.Suppressions);
        }

        [Fact]
        public void Handle_StatusEntersSet_PinsThePublishedVersion()
        {
            HandleStatusChange();

            Assert.Equal(3, _store.Invitations.Single().PinnedVersion);
        }

        [Fact]
        public void Handle_ExpiryDaysSet_ExpiresThatManyDaysAfterGeneration()
        {
            HandleStatusChange();

            Assert.Equal(_store.UtcNow.AddDays(14), _store.Invitations.Single().ExpiresOn);
        }

        [Fact]
        public void Handle_LegacyOriginWithSecureLinkDelivery_UsesTheSecureLinkChannel()
        {
            _store.CurrentRecord.Origin = "751090000";

            HandleStatusChange();

            Assert.Equal(InvitationChannel.SecureLink, _store.Invitations.Single().Channel);
        }

        [Fact]
        public void Handle_CustomerLanguageArabic_PinsTheArabicVersion()
        {
            _store.Settings = new SurveySettings { LanguageField = "qdb_preferred_language", DefaultLanguage = "en" };
            _store.CustomerLanguage = 1025;
            _store.PublishedVersions[FormCode + "|ar"] = 4;

            HandleStatusChange();

            Assert.Equal("ar", _store.Invitations.Single().LanguageCode);
            Assert.Equal(4, _store.Invitations.Single().PinnedVersion);
        }

        [Fact]
        public void Handle_StatusMovesInsideSet_WritesNothing()
        {
            _store.CurrentRecord.OldStatus = "100000005";

            HandleStatusChange();

            Assert.Empty(_store.Invitations);
            Assert.Empty(_store.Suppressions);
        }

        [Fact]
        public void Handle_TableIsNotAnActiveSource_WritesNothing()
        {
            _store.ActiveSource = new SurveySource(Guid.NewGuid(), "qdb_other_table", new SourceFields());

            HandleStatusChange();

            Assert.Empty(_store.Invitations);
            Assert.Empty(_store.Suppressions);
        }

        [Fact]
        public void Handle_NoCustomer_LogsNoCustomer()
        {
            _store.CurrentRecord.CustomerId = null;

            HandleStatusChange();

            Assert.Equal(SuppressionReason.NoCustomer, OnlySuppressionReason());
        }

        [Fact]
        public void Handle_DeliveryNoneForOrigin_LogsChannelNone()
        {
            _store.Triggers[0].Setup.DeliveryLegacy = DeliveryChoice.None;
            _store.CurrentRecord.Origin = "751090000";

            HandleStatusChange();

            Assert.Equal(SuppressionReason.ChannelNone, OnlySuppressionReason());
        }

        [Fact]
        public void Handle_OutsideActiveWindow_LogsOutsideWindow()
        {
            _store.Triggers[0].Setup.ActiveTo = _store.UtcNow.Date.AddDays(-1);

            HandleStatusChange();

            Assert.Equal(SuppressionReason.OutsideWindow, OnlySuppressionReason());
        }

        [Fact]
        public void Handle_SameEventTwice_CreatesOneInvitationAndLogsTheDuplicate()
        {
            HandleStatusChange();
            HandleStatusChange();

            Assert.Single(_store.Invitations);
            Assert.Equal(SuppressionReason.Duplicate, OnlySuppressionReason());
        }

        [Fact]
        public void Handle_ConcurrentRunCreatedItFirst_LogsDuplicateInsteadOfFailing()
        {
            _store.SimulateConcurrentDuplicate = true;

            HandleStatusChange();

            Assert.Equal(SuppressionReason.Duplicate, OnlySuppressionReason());
        }

        [Fact]
        public void Handle_FormNotPublishedInLanguage_LogsFormNotPublished()
        {
            _store.PublishedVersions.Clear();

            HandleStatusChange();

            Assert.Equal(SuppressionReason.FormNotPublished, OnlySuppressionReason());
        }

        [Fact]
        public void Handle_Suppression_RecordsTheTriggerSetupAndSourceRecord()
        {
            _store.CurrentRecord.CustomerId = null;

            HandleStatusChange();

            var entry = _store.Suppressions.Single();
            Assert.Equal(_store.Triggers[0].Id, entry.TriggerId);
            Assert.Equal(_store.Triggers[0].Setup.Id, entry.SetupId);
            Assert.Equal(RecordId, entry.SourceRecordId);
        }

        [Fact]
        public void Compose_MissingDependency_Throws()
        {
            var dependencies = _store.AsDependencies();
            dependencies.Clock = null;

            Assert.Throws<ArgumentException>(() => SurveyTriggerService.Compose(dependencies));
        }
    }
}
