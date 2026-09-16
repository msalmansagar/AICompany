using System;
using Microsoft.Xrm.Sdk;
using Msst.DebtCollection.Plugins.Plugins;
using Msst.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Msst.DebtCollection.Plugins.Tests
{
    public sealed class ActivitySubjectComposerTests
    {
        private const string EntityAction = "msst_dcpcollectionaction";
        private const string EntityCommunication = "msst_dcpcommunication";

        // ── CollectionAction subjects ─────────────────────────────────────────────

        [Fact]
        public void ComposeSubject_CollectionActionWithActionTypeCall_SetsSubjectContainingCall()
        {
            // Arrange
            var target = new Entity(EntityAction);
            target["msst_actiontype"] = new OptionSetValue(463270081); // Call

            var composer = BuildComposer(EntityAction, target);

            // Act
            composer.ComposeSubject();

            // Assert
            var subject = (string)target["subject"];
            Assert.Contains("Call", subject);
        }

        [Fact]
        public void ComposeSubject_CollectionActionWithActionTypeMeeting_SetsSubjectContainingMeeting()
        {
            // Arrange
            var target = new Entity(EntityAction);
            target["msst_actiontype"] = new OptionSetValue(463270082); // Meeting

            var composer = BuildComposer(EntityAction, target);

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("Meeting", (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_CollectionActionNoActionType_SetsSubjectContainingAction()
        {
            // Arrange — no action type on target; subject uses fallback label
            var target = new Entity(EntityAction);
            var composer = BuildComposer(EntityAction, target);

            // Act
            composer.ComposeSubject();

            // Assert
            var subject = (string)target["subject"];
            Assert.NotEmpty(subject);
            Assert.Contains("Action", subject);
        }

        [Fact]
        public void ComposeSubject_CollectionAction_SetsSubjectContainingDate()
        {
            // Arrange
            var target = new Entity(EntityAction);
            var composer = BuildComposer(EntityAction, target);

            // Act
            composer.ComposeSubject();

            // Assert — subject must contain a date in yyyy-MM-dd format
            var subject = (string)target["subject"];
            var todayPrefix = DateTime.UtcNow.ToString("yyyy-MM-");
            Assert.Contains(todayPrefix, subject);
        }

        // ── Communication subjects ────────────────────────────────────────────────

        [Fact]
        public void ComposeSubject_CommunicationWithChannelSms_SetsSubjectContainingSms()
        {
            // Arrange
            var target = new Entity(EntityCommunication);
            target["msst_channel"] = new OptionSetValue(463270021); // SMS

            var composer = BuildComposer(EntityCommunication, target);

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("SMS", (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_CommunicationWithChannelEmail_SetsSubjectContainingEmail()
        {
            // Arrange
            var target = new Entity(EntityCommunication);
            target["msst_channel"] = new OptionSetValue(463270022); // Email

            var composer = BuildComposer(EntityCommunication, target);

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("Email", (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_CommunicationNoChannel_SetsSubjectContainingCommunication()
        {
            // Arrange — no channel set; subject uses fallback label
            var target = new Entity(EntityCommunication);
            var composer = BuildComposer(EntityCommunication, target);

            // Act
            composer.ComposeSubject();

            // Assert
            Assert.Contains("Communication", (string)target["subject"]);
        }

        [Fact]
        public void ComposeSubject_Communication_SetsSubjectContainingDate()
        {
            // Arrange
            var target = new Entity(EntityCommunication);
            var composer = BuildComposer(EntityCommunication, target);

            // Act
            composer.ComposeSubject();

            // Assert
            var todayPrefix = DateTime.UtcNow.ToString("yyyy-MM-");
            Assert.Contains(todayPrefix, (string)target["subject"]);
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static ActivitySubjectComposer BuildComposer(string entityName, Entity target)
        {
            var builder = new PluginContextBuilder()
                .WithMessage("Create")
                .WithEntity(entityName, Guid.NewGuid())
                .WithTarget(target)
                .WithEmptyPreImages();

            return new ActivitySubjectComposer(builder.Service, builder.Tracing, builder.Context);
        }
    }
}
