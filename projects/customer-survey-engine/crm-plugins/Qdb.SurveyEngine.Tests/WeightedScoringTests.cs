using System;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>Addendum A weighted scoring (FR-CSE-061..068), starting from the addendum's worked example.</summary>
    public class WeightedScoringTests
    {
        private const string FormCode = "srv-weighted";
        private static readonly Guid CustomerId = new Guid("cccccccc-0000-0000-0000-00000000000c");

        // Overall ×3 (stars 1–5), Ease ×1 (stars 1–5), Recommend ×2 (Yes 10 / Maybe 5 / No 0), a text question,
        // Channels (multi, weight 1: Portal 3 / Branch 2 / Phone 0) and Spend (number 0–10, weight 1).
        private static string FormJson(string scoringMode = "\"scoringMode\":\"weighted\",", string recommendWeight = "2") => $@"{{{scoringMode}""tabs"":[{{""displayOrder"":1,""sections"":[{{""displayOrder"":1,""fields"":[
            {{""schemaName"":""overall"",""label"":""Overall"",""displayOrder"":1,""fieldType"":""radio"",""radioRenderStyle"":""rating"",""scoreWeight"":3,
              ""options"":[{{""value"":""1"",""label"":""1""}},{{""value"":""2"",""label"":""2""}},{{""value"":""3"",""label"":""3""}},{{""value"":""4"",""label"":""4""}},{{""value"":""5"",""label"":""5""}}]}},
            {{""schemaName"":""ease"",""label"":""Ease"",""displayOrder"":2,""fieldType"":""radio"",""radioRenderStyle"":""rating"",
              ""options"":[{{""value"":""1"",""label"":""1""}},{{""value"":""2"",""label"":""2""}},{{""value"":""3"",""label"":""3""}},{{""value"":""4"",""label"":""4""}},{{""value"":""5"",""label"":""5""}}]}},
            {{""schemaName"":""recommend"",""label"":""Recommend"",""displayOrder"":3,""fieldType"":""radio"",""scoreWeight"":{recommendWeight},
              ""options"":[{{""value"":""y"",""label"":""Yes"",""scorePoints"":10}},{{""value"":""m"",""label"":""Maybe"",""scorePoints"":5}},{{""value"":""n"",""label"":""No"",""scorePoints"":0}}]}},
            {{""schemaName"":""well"",""label"":""What did we do well?"",""displayOrder"":4,""fieldType"":""textarea""}},
            {{""schemaName"":""channels"",""label"":""Channels"",""displayOrder"":5,""fieldType"":""multi_select"",
              ""options"":[{{""value"":""p"",""label"":""Portal"",""scorePoints"":3}},{{""value"":""b"",""label"":""Branch"",""scorePoints"":2}},{{""value"":""t"",""label"":""Phone"",""scorePoints"":0}}]}},
            {{""schemaName"":""spend"",""label"":""Spend"",""displayOrder"":6,""fieldType"":""number"",""scoreMin"":0,""scoreMax"":10}}]}}]}}]}}";

        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryIntegrationStore _store = new InMemoryIntegrationStore();
        private readonly InvitationRecord _invitation;

        public WeightedScoringTests()
        {
            _invitation = new InvitationRecord { Id = Guid.NewGuid(), CustomerId = CustomerId, SetupId = Guid.NewGuid(), FormCode = FormCode, PinnedVersion = 1, LanguageCode = "en", Status = InvitationStatus.Pending };
            _store.Invitations[_invitation.Id] = _invitation;
            _store.RuntimeJson[$"{FormCode}|1|en"] = FormJson();
        }

        private ResponseDraft Submit(string answersJson)
        {
            var deps = new IntegrationDependencies { Invitations = _store, Forms = _store, Responses = _store, Config = _pipeline, Clock = _pipeline };
            new ResponseSubmitter(deps, new InvitationAccess(deps)).Submit(new InvitationRequest { InvitationId = _invitation.Id, CallerCustomerId = CustomerId }, answersJson);
            return _store.Responses.Single();
        }

        private static string Answers(params (string Code, string Value)[] answers) =>
            "[" + string.Join(",", answers.Select(a => $"{{\"questionCode\":\"{a.Code}\",\"value\":\"{a.Value}\"}}")) + "]";

        [Fact]
        public void Submit_WorkedExample_Scores27OutOf40Is67Point5Percent()
        {
            var draft = Submit(Answers(("overall", "4"), ("ease", "5"), ("recommend", "m"), ("well", "Fast")));

            Assert.Equal(27m, draft.Score.Total);
            Assert.Equal(40m, draft.Score.Maximum);
            Assert.Equal(67.5m, draft.Score.Percent);
        }

        [Fact]
        public void Submit_WorkedExample_StoresPointsAndWeightedPointsPerAnswer()
        {
            var recommend = Submit(Answers(("recommend", "m"))).Answers.Single();

            Assert.Equal(5m, recommend.Score.Points);
            Assert.Equal(10m, recommend.Score.WeightedPoints);
        }

        [Fact]
        public void Submit_TextQuestion_IsNeverScored()
        {
            Assert.Null(Submit(Answers(("well", "Fast"))).Answers.Single().Score);
        }

        [Fact]
        public void Submit_SkippedQuestion_IsLeftOutOfTheMaximum()
        {
            var draft = Submit(Answers(("overall", "4"), ("ease", "5")));

            Assert.Equal(17m, draft.Score.Total);
            Assert.Equal(20m, draft.Score.Maximum);
            Assert.Equal(85m, draft.Score.Percent);
        }

        [Fact]
        public void Submit_MultiChoice_SumsTheChosenOptionsAgainstAllPositivePoints()
        {
            var channels = Submit(Answers(("channels", "p,b"))).Answers.Single().Score;

            Assert.Equal(5m, channels.Points);
            Assert.Equal(5m, channels.WeightedMaximum);
        }

        [Fact]
        public void Submit_NumberAboveItsMaximum_IsCapped()
        {
            var spend = Submit(Answers(("spend", "14"))).Answers.Single().Score;

            Assert.Equal(10m, spend.Points);
            Assert.Equal(10m, spend.WeightedMaximum);
        }

        [Fact]
        public void Submit_WeightZero_LeavesTheQuestionOutOfTheScore()
        {
            _store.RuntimeJson[$"{FormCode}|1|en"] = FormJson(recommendWeight: "0");

            var draft = Submit(Answers(("overall", "4"), ("recommend", "y")));

            Assert.Equal(12m, draft.Score.Total);
            Assert.Equal(15m, draft.Score.Maximum);
        }

        [Fact]
        public void Submit_NormalSurvey_StoresNoScoreAtAll()
        {
            _store.RuntimeJson[$"{FormCode}|1|en"] = FormJson(scoringMode: string.Empty);

            var draft = Submit(Answers(("overall", "4"), ("recommend", "m")));

            Assert.Null(draft.Score);
            Assert.All(draft.Answers, a => Assert.Null(a.Score));
        }

        [Fact]
        public void Submit_OnlyTextAnswered_HasAScoreWithNoPercent()
        {
            var draft = Submit(Answers(("well", "Fast")));

            Assert.Equal(0m, draft.Score.Maximum);
            Assert.Null(draft.Score.Percent);
        }

        [Fact]
        public void Submit_RatingStillKeepsItsNumericValueForCharts()
        {
            Assert.Equal(4m, Submit(Answers(("overall", "4"))).Answers.Single().AnswerNumeric);
        }
    }
}
