using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Qdb.SurveyEngine.Plugins;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>In-memory invitations, render cache and responses, so the integration services run for real.</summary>
    public sealed class InMemoryIntegrationStore : IIntegrationInvitationStore, IPublishedFormReader, IResponseWriter
    {
        public Dictionary<Guid, InvitationRecord> Invitations { get; } = new Dictionary<Guid, InvitationRecord>();
        public Dictionary<Guid, string> TokenHashes { get; } = new Dictionary<Guid, string>();
        public Dictionary<string, string> RuntimeJson { get; } = new Dictionary<string, string>();
        public List<ResponseDraft> Responses { get; } = new List<ResponseDraft>();
        public List<InvitationClosure> Closures { get; } = new List<InvitationClosure>();
        public List<PendingInvitation> Open { get; } = new List<PendingInvitation>();

        public InvitationRecord FindById(Guid invitationId) => Invitations.TryGetValue(invitationId, out var invitation) ? invitation : null;

        public InvitationRecord FindByTokenHash(string tokenHash) =>
            TokenHashes.Where(t => t.Value == tokenHash).Select(t => FindById(t.Key)).FirstOrDefault();

        public IReadOnlyList<PendingInvitation> ListOpen(Guid customerId, DateTime nowUtc) => Open.Where(p => p.Invitation.CustomerId == customerId).ToList();

        /// <summary>Close attempts that fail with a row-version mismatch before one succeeds; the action runs on each failure.</summary>
        public Queue<Action> CloseConflicts { get; } = new Queue<Action>();

        public bool TryClose(InvitationClosure closure)
        {
            if (CloseConflicts.Count > 0) { CloseConflicts.Dequeue()(); return false; }
            Closures.Add(closure);
            closure.Invitation.Status = InvitationStatus.Submitted;
            return true;
        }

        public string FindRuntimeJson(string formCode, int version, string languageCode) =>
            RuntimeJson.TryGetValue($"{formCode}|{version}|{languageCode}", out var json) ? json : null;

        public ResponseCreation Create(ResponseDraft draft)
        {
            if (Responses.Any(r => r.Invitation.Id == draft.Invitation.Id)) return ResponseCreation.Duplicate();
            Responses.Add(draft);
            return ResponseCreation.Created(Guid.NewGuid());
        }
    }

    public class IntegrationApiTests
    {
        private const string FormCode = "srv-customer-feedback-demo";
        private const string Token = "test-token-value";
        private static readonly Guid CustomerId = new Guid("aaaaaaaa-0000-0000-0000-00000000000a");
        private static readonly Guid OtherCustomerId = new Guid("bbbbbbbb-0000-0000-0000-00000000000b");

        private const string SurveyJson = @"{""formCode"":""srv-customer-feedback-demo"",""tabs"":[
            {""displayOrder"":2,""sections"":[{""displayOrder"":1,""fields"":[{""schemaName"":""srv_well"",""label"":""What did we do well?"",""displayOrder"":1,""fieldType"":""textarea""}]}]},
            {""displayOrder"":1,""sections"":[{""displayOrder"":1,""fields"":[
                {""schemaName"":""srv_channel"",""label"":""Channels used"",""displayOrder"":2,""options"":[{""value"":""1"",""label"":""Portal""},{""value"":""2"",""label"":""Branch""}]},
                {""schemaName"":""srv_overall"",""label"":""Overall satisfaction"",""displayOrder"":1,""radioRenderStyle"":""rating"",
                 ""options"":[{""value"":""1"",""label"":""Very poor""},{""value"":""5"",""label"":""Excellent""}]},
                {""fieldType"":""label"",""label"":""Thank you"",""displayOrder"":3}]}]}]}";

        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryIntegrationStore _store = new InMemoryIntegrationStore();
        private readonly InvitationRecord _invitation;

        public IntegrationApiTests()
        {
            _invitation = new InvitationRecord
            {
                Id = Guid.NewGuid(), CustomerId = CustomerId, SetupId = Guid.NewGuid(), FormCode = FormCode, PinnedVersion = 2, LanguageCode = "en",
                Status = InvitationStatus.Pending, ExpiresOn = _pipeline.UtcNow.AddDays(5),
            };
            _store.Invitations[_invitation.Id] = _invitation;
            _store.RuntimeJson[$"{FormCode}|2|en"] = SurveyJson;
        }

        private IntegrationDependencies Deps() => new IntegrationDependencies { Invitations = _store, Forms = _store, Responses = _store, Config = _pipeline, Clock = _pipeline };

        private InvitationAccess Access() => new InvitationAccess(Deps());

        private InvitationRequest ForCustomer(Guid customerId) => new InvitationRequest { InvitationId = _invitation.Id, CallerCustomerId = customerId };

        private InvitationRequest WithToken()
        {
            _pipeline.Settings.SecureLinkEnabled = true;
            _store.TokenHashes[_invitation.Id] = LinkToken.Hash(Token);
            return new InvitationRequest { Token = Token };
        }

        private static string CodeOf(Action action) => Assert.Throws<SurveyApiException>(action).Code;

        private Guid Submit(InvitationRequest request, string answersJson) => new ResponseSubmitter(Deps(), Access()).Submit(request, answersJson);

        [Fact]
        public void Open_OwnInvitation_ReturnsIt()
        {
            Assert.Equal(_invitation.Id, Access().Open(ForCustomer(CustomerId)).Id);
        }

        [Fact]
        public void Open_AnotherCustomersInvitation_IsForbidden()
        {
            Assert.Equal(SurveyApiException.Forbidden, CodeOf(() => Access().Open(ForCustomer(OtherCustomerId))));
        }

        [Fact]
        public void Open_NoCustomerAndNoToken_IsABadRequest()
        {
            Assert.Equal(SurveyApiException.BadRequest, CodeOf(() => Access().Open(new InvitationRequest { InvitationId = _invitation.Id })));
        }

        [Fact]
        public void Open_UnknownInvitation_IsNotFound()
        {
            Assert.Equal(SurveyApiException.NotFound, CodeOf(() => Access().Open(new InvitationRequest { InvitationId = Guid.NewGuid(), CallerCustomerId = CustomerId })));
        }

        [Fact]
        public void Open_PastItsExpiry_IsExpired()
        {
            _invitation.ExpiresOn = _pipeline.UtcNow.AddMinutes(-1);

            Assert.Equal(SurveyApiException.Expired, CodeOf(() => Access().Open(ForCustomer(CustomerId))));
        }

        [Fact]
        public void Open_AlreadySubmitted_SaysSo()
        {
            _invitation.Status = InvitationStatus.Submitted;

            Assert.Equal(SurveyApiException.AlreadySubmitted, CodeOf(() => Access().Open(ForCustomer(CustomerId))));
        }

        [Fact]
        public void Open_Postponed_IsNotFoundBecauseItWasNeverSent()
        {
            _invitation.Status = InvitationStatus.Postponed;

            Assert.Equal(SurveyApiException.NotFound, CodeOf(() => Access().Open(ForCustomer(CustomerId))));
        }

        [Fact]
        public void Open_TokenWhileSecureLinkIsDisabled_IsForbidden()
        {
            var request = WithToken();
            _pipeline.Settings.SecureLinkEnabled = false;

            Assert.Equal(SurveyApiException.Forbidden, CodeOf(() => Access().Open(request)));
        }

        [Fact]
        public void Open_ValidToken_UnlocksItsInvitationWithoutACustomerId()
        {
            Assert.Equal(_invitation.Id, Access().Open(WithToken()).Id);
        }

        [Fact]
        public void Validate_UsedToken_IsInvalidWithReasonUsed()
        {
            WithToken();
            _invitation.TokenUsedOn = _pipeline.UtcNow.AddDays(-1);

            Assert.Equal("used", new LinkTokenValidator(Access()).Validate(Token).Reason);
        }

        [Fact]
        public void Validate_ExpiredToken_IsInvalidWithReasonExpired()
        {
            WithToken();
            _invitation.ExpiresOn = _pipeline.UtcNow.AddDays(-1);

            Assert.Equal("expired", new LinkTokenValidator(Access()).Validate(Token).Reason);
        }

        [Fact]
        public void Validate_GuessedToken_IsInvalidWithReasonUnknown()
        {
            WithToken();

            Assert.Equal("unknown", new LinkTokenValidator(Access()).Validate("guessed").Reason);
        }

        [Fact]
        public void Validate_GoodToken_ReturnsItsInvitation()
        {
            WithToken();

            Assert.Equal(_invitation.Id, new LinkTokenValidator(Access()).Validate(Token).Invitation.Id);
        }

        [Fact]
        public void List_ArabicRequested_UsesArabicWordingAndFallsBackToEnglishWhenEmpty()
        {
            _store.Open.Add(new PendingInvitation { Invitation = _invitation, TitleArabic = "استبيان", TitleEnglish = "Survey", MessageEnglish = "Tell us" });

            var item = new PendingSurveyLister(Deps()).List(CustomerId, "ar").Single();

            Assert.Equal("استبيان", item.Title);
            Assert.Equal("Tell us", item.Message);
        }

        [Fact]
        public void Read_RequestedLanguageNotPublished_FallsBackToTheInvitationsLanguage()
        {
            var survey = new SurveyReader(Deps(), Access()).Read(ForCustomer(CustomerId), "ar");

            Assert.Equal("en", survey.Language);
            Assert.Equal(SurveyJson, survey.RuntimeJson);
        }

        [Fact]
        public void Read_PinnedVersionMissingFromTheCache_IsNotFound()
        {
            _store.RuntimeJson.Clear();

            Assert.Equal(SurveyApiException.NotFound, CodeOf(() => new SurveyReader(Deps(), Access()).Read(ForCustomer(CustomerId), null)));
        }

        [Fact]
        public void Submit_Answers_WritesOneRowPerAnsweredQuestionInFormOrderWithLabels()
        {
            Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_well"",""value"":""Fast""},{""questionCode"":""srv_overall"",""value"":""5""},{""questionCode"":""srv_channel"",""value"":""1,2""}]");

            var rows = _store.Responses.Single().Answers;
            Assert.Equal(new[] { "srv_overall", "srv_channel", "srv_well" }, rows.Select(r => r.QuestionCode));
            Assert.Equal(new[] { 1, 2, 3 }, rows.Select(r => r.QuestionOrder));
        }

        [Fact]
        public void Submit_Rating_StoresTheLabelAsTextAndTheValueAsANumber()
        {
            Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_overall"",""value"":""5""}]");

            var rating = _store.Responses.Single().Answers.Single();
            Assert.Equal("Excellent", rating.AnswerText);
            Assert.Equal(5m, rating.AnswerNumeric);
        }

        [Fact]
        public void Submit_SeveralOptions_JoinsTheirLabels()
        {
            Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_channel"",""value"":""1,2""}]");

            Assert.Equal("Portal, Branch", _store.Responses.Single().Answers.Single().AnswerText);
        }

        [Fact]
        public void Submit_Answers_KeepsTheJsonAsSentAndClosesTheInvitation()
        {
            const string json = @"[{""questionCode"":""srv_well"",""value"":""Fast""}]";

            Submit(ForCustomer(CustomerId), json);

            Assert.Equal(json, _store.Responses.Single().AnswersJson);
            Assert.False(_store.Closures.Single().WasOpenedByToken);
        }

        [Fact]
        public void Submit_ByToken_MarksTheTokenUsed()
        {
            Submit(WithToken(), @"[{""questionCode"":""srv_well"",""value"":""Fast""}]");

            Assert.True(_store.Closures.Single().WasOpenedByToken);
        }

        [Fact]
        public void Submit_UnknownQuestion_IsABadRequestAndWritesNothing()
        {
            Assert.Equal(SurveyApiException.BadRequest, CodeOf(() => Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_nope"",""value"":""x""}]")));
            Assert.Empty(_store.Responses);
        }

        [Fact]
        public void Submit_NotJson_IsABadRequest()
        {
            Assert.Equal(SurveyApiException.BadRequest, CodeOf(() => Submit(ForCustomer(CustomerId), "srv_well=Fast")));
        }

        [Fact]
        public void Submit_Twice_IsRefusedTheSecondTime()
        {
            Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_well"",""value"":""Fast""}]");

            Assert.Equal(SurveyApiException.AlreadySubmitted, CodeOf(() => Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_well"",""value"":""Again""}]")));
        }

        [Fact]
        public void Submit_InvitationEditedMeanwhileButStillOpen_ClosesItAgainstTheFreshVersion()
        {
            _store.CloseConflicts.Enqueue(() => _invitation.ExpiresOn = _pipeline.UtcNow.AddDays(9));

            Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_well"",""value"":""Fast""}]");

            Assert.Single(_store.Closures);
        }

        [Fact]
        public void Submit_InvitationExpiredMeanwhile_SaysExpiredNotAlreadySubmitted()
        {
            _store.CloseConflicts.Enqueue(() => _invitation.ExpiresOn = _pipeline.UtcNow.AddDays(-1));

            Assert.Equal(SurveyApiException.Expired, CodeOf(() => Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_well"",""value"":""Fast""}]")));
        }

        [Fact]
        public void Submit_ConcurrentResponseAlreadyWritten_IsAlreadySubmitted()
        {
            _store.Responses.Add(new ResponseDraft { Invitation = _invitation, Answers = new AnswerRow[0] });

            Assert.Equal(SurveyApiException.AlreadySubmitted, CodeOf(() => Submit(ForCustomer(CustomerId), @"[{""questionCode"":""srv_well"",""value"":""Fast""}]")));
        }
    }

    public class LinkTokenTests
    {
        [Fact]
        public void Generate_Token_IsUrlSafeAnd43Characters()
        {
            var token = LinkToken.Generate();

            Assert.Equal(43, token.Length);
            Assert.DoesNotContain(token, c => c == '+' || c == '/' || c == '=');
        }

        [Fact]
        public void Generate_TwoTokens_Differ()
        {
            Assert.NotEqual(LinkToken.Generate(), LinkToken.Generate());
        }

        [Fact]
        public void Hash_KnownInput_IsItsSha256Hex()
        {
            Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", LinkToken.Hash("abc"));
        }
    }

    public class IntegrationDataTests
    {
        [Fact]
        public void Decompress_GzippedBase64_ReturnsTheJson()
        {
            const string json = "{\"formCode\":\"srv-x\",\"label\":\"تقييم\"}";
            string base64;
            using (var output = new MemoryStream())
            {
                using (var gzip = new GZipStream(output, CompressionMode.Compress, true)) { var bytes = Encoding.UTF8.GetBytes(json); gzip.Write(bytes, 0, bytes.Length); }
                base64 = Convert.ToBase64String(output.ToArray());
            }

            Assert.Equal(json, PublishedFormReader.Decompress(base64));
        }

        [Fact]
        public void OptionalGuid_NotAGuid_IsABadRequest()
        {
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(new ParameterCollection { { "InvitationId", "not-a-guid" } });
            var call = new PluginCall(context.Object, new IntegrationDependencies());

            Assert.Equal(SurveyApiException.BadRequest, Assert.Throws<SurveyApiException>(() => call.OptionalGuid("InvitationId")).Code);
        }
    }
}
