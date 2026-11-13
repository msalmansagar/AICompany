using System;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// Close paths not covered by IntegrationApiTests: invitation deleted between response write
    /// and close, and second TryClose also failing (concurrent double edit).
    /// </summary>
    public class ResponseSubmitterCloseRetryTests
    {
        private const string FormCode = "srv-retry-test";
        private static readonly Guid CustomerId = new Guid("aaaaaaaa-0000-0000-0000-00000000000a");

        private const string MinimalSurveyJson =
            @"{""formCode"":""srv-retry-test"",""tabs"":[{""displayOrder"":1,""sections"":[{""displayOrder"":1,""fields"":[{""schemaName"":""srv_q"",""label"":""Q"",""displayOrder"":1}]}]}]}";

        private const string Answers = @"[{""questionCode"":""srv_q"",""value"":""yes""}]";

        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryIntegrationStore _store = new InMemoryIntegrationStore();
        private readonly InvitationRecord _invitation;

        public ResponseSubmitterCloseRetryTests()
        {
            _invitation = new InvitationRecord
            {
                Id = Guid.NewGuid(), CustomerId = CustomerId, SetupId = Guid.NewGuid(),
                FormCode = FormCode, PinnedVersion = 1, LanguageCode = "en",
                Status = InvitationStatus.Pending, ExpiresOn = _pipeline.UtcNow.AddDays(5),
            };
            _store.Invitations[_invitation.Id] = _invitation;
            _store.RuntimeJson[$"{FormCode}|1|en"] = MinimalSurveyJson;
        }

        private IntegrationDependencies Deps() => new IntegrationDependencies
        {
            Invitations = _store, Forms = _store, Responses = _store, Config = _pipeline, Clock = _pipeline,
        };

        private void Submit() =>
            new ResponseSubmitter(Deps(), new InvitationAccess(Deps())).Submit(
                new InvitationRequest { InvitationId = _invitation.Id, CallerCustomerId = CustomerId }, Answers);

        [Fact]
        public void Submit_InvitationGoneAfterResponseWrite_IsNotFound()
        {
            // First TryClose fails (row-version mismatch); FindById returns null (invitation deleted mid-flight)
            _store.CloseConflicts.Enqueue(() => _store.Invitations.Remove(_invitation.Id));

            var ex = Assert.Throws<SurveyApiException>((Action)Submit);

            Assert.Equal(SurveyApiException.NotFound, ex.Code);
        }

        [Fact]
        public void Submit_SecondTryCloseAlsoFails_IsAlreadySubmitted()
        {
            // Both TryClose attempts fail (double concurrent modification of the same row)
            _store.CloseConflicts.Enqueue(() => { }); // first fails; invitation still open
            _store.CloseConflicts.Enqueue(() => { }); // second also fails

            var ex = Assert.Throws<SurveyApiException>((Action)Submit);

            Assert.Equal(SurveyApiException.AlreadySubmitted, ex.Code);
        }

        [Fact]
        public void Submit_InvitationGoneAfterResponseWrite_WritesNothingToClosures()
        {
            _store.CloseConflicts.Enqueue(() => _store.Invitations.Remove(_invitation.Id));

            Assert.Throws<SurveyApiException>((Action)Submit);

            Assert.Empty(_store.Closures);
        }
    }
}
