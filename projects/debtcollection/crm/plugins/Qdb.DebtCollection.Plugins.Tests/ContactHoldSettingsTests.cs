using Qdb.DebtCollection.Plugins.Domain;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// Tests for the deployment configuration that tells the contact-hold guard which customer
    /// column to read. The canonical schema owns no customer master, so this is the seam that keeps
    /// a QDB-specific column name out of the shared Collection logic.
    /// </summary>
    public sealed class ContactHoldSettingsTests
    {
        [Fact]
        public void Parse_NullConfiguration_IsNotConfigured()
        {
            var settings = ContactHoldSettings.Parse(null);

            Assert.False(settings.IsConfigured);
        }

        [Fact]
        public void Parse_EmptyConfiguration_IsNotConfigured()
        {
            var settings = ContactHoldSettings.Parse("   ");

            Assert.False(settings.IsConfigured);
        }

        [Fact]
        public void Parse_HoldAttributeOnly_ReadsTheColumnName()
        {
            var settings = ContactHoldSettings.Parse("holdAttribute=qdb_contacthold");

            Assert.Equal("qdb_contacthold", settings.HoldAttribute);
        }

        [Fact]
        public void Parse_HoldAttributeOnly_IsConfigured()
        {
            var settings = ContactHoldSettings.Parse("holdAttribute=qdb_contacthold");

            Assert.True(settings.IsConfigured);
        }

        [Fact]
        public void Parse_HoldAttributeOnly_FallsBackToTheDefaultQueue()
        {
            var settings = ContactHoldSettings.Parse("holdAttribute=qdb_contacthold");

            Assert.Equal(ContactHoldSettings.DefaultSuppressionQueueName, settings.SuppressionQueueName);
        }

        [Fact]
        public void Parse_SuppressionQueue_OverridesTheDefaultQueue()
        {
            var settings = ContactHoldSettings.Parse(
                "holdAttribute=qdb_contacthold\nsuppressionQueue=Deceased Review QA");

            Assert.Equal("Deceased Review QA", settings.SuppressionQueueName);
        }

        [Fact]
        public void Parse_KeysAreCaseInsensitive()
        {
            var settings = ContactHoldSettings.Parse("HOLDATTRIBUTE=qdb_contacthold");

            Assert.Equal("qdb_contacthold", settings.HoldAttribute);
        }

        [Fact]
        public void Parse_SurroundingWhitespace_IsTrimmed()
        {
            var settings = ContactHoldSettings.Parse("holdAttribute =  qdb_contacthold  ");

            Assert.Equal("qdb_contacthold", settings.HoldAttribute);
        }

        [Fact]
        public void Parse_UnknownKeys_AreIgnored()
        {
            var settings = ContactHoldSettings.Parse(
                "unrelatedKey=whatever\nholdAttribute=qdb_contacthold");

            Assert.Equal("qdb_contacthold", settings.HoldAttribute);
        }

        [Fact]
        public void Parse_SuppressionQueueWithoutHoldAttribute_StaysInactive()
        {
            // A queue name alone says nothing about which column signals the hold.
            var settings = ContactHoldSettings.Parse("suppressionQueue=Deceased Review QA");

            Assert.False(settings.IsConfigured);
        }
    }
}
