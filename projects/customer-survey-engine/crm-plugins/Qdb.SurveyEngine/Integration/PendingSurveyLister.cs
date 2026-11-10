using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// qdb_srv_ListPendingSurveys (FR-CSE-051, 047): a customer's open invitations with title and
    /// message in the requested language. This list is how Portal delivery reaches the customer;
    /// the QDB portal and app show each item as a popup or notification.
    /// </summary>
    public sealed class PendingSurveyLister
    {
        private readonly IntegrationDependencies _deps;

        public PendingSurveyLister(IntegrationDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        /// <summary>The customer's open surveys; wording falls back to the other language when one is empty.</summary>
        public IReadOnlyList<PendingSurveyItem> List(Guid customerId, string language)
        {
            var isArabic = SurveyLanguage.IsArabic(language, _deps.Config.GetSettings().DefaultLanguage);
            return _deps.Invitations.ListOpen(customerId, _deps.Clock.UtcNow).Select(pending => ToItem(pending, isArabic)).ToList();
        }

        private static PendingSurveyItem ToItem(PendingInvitation pending, bool isArabic)
        {
            var invitation = pending.Invitation;
            return new PendingSurveyItem
            {
                InvitationId = invitation.Id.ToString("D"),
                SetupId = invitation.SetupId.ToString("D"),
                FormCode = invitation.FormCode,
                Title = Pick(isArabic, pending.TitleArabic, pending.TitleEnglish),
                Message = Pick(isArabic, pending.MessageArabic, pending.MessageEnglish),
                PinnedVersion = invitation.PinnedVersion,
                Language = invitation.LanguageCode,
                ExpiresOn = invitation.ExpiresOn?.ToString("o"),
                Channel = invitation.Channel?.ToString(),
            };
        }

        private static string Pick(bool isArabic, string arabic, string english) =>
            isArabic ? (string.IsNullOrWhiteSpace(arabic) ? english : arabic) : (string.IsNullOrWhiteSpace(english) ? arabic : english);
    }

    /// <summary>One entry of the pending-surveys list (section 9.2).</summary>
    [DataContract]
    public sealed class PendingSurveyItem
    {
        [DataMember(Name = "invitationId", Order = 1)] public string InvitationId { get; set; }
        [DataMember(Name = "setupId", Order = 2)] public string SetupId { get; set; }
        [DataMember(Name = "formCode", Order = 3)] public string FormCode { get; set; }
        [DataMember(Name = "title", Order = 4)] public string Title { get; set; }
        [DataMember(Name = "message", Order = 5)] public string Message { get; set; }
        [DataMember(Name = "pinnedVersion", Order = 6)] public int PinnedVersion { get; set; }
        [DataMember(Name = "language", Order = 7)] public string Language { get; set; }
        [DataMember(Name = "expiresOn", Order = 8)] public string ExpiresOn { get; set; }
        [DataMember(Name = "channel", Order = 9)] public string Channel { get; set; }
    }

    /// <summary>The two survey languages (render cache codes "en" and "ar").</summary>
    public static class SurveyLanguage
    {
        /// <summary>True for "ar..." , else the default decides when the requested language is empty.</summary>
        public static bool IsArabic(string requested, string defaultLanguage) =>
            Normalise(requested, defaultLanguage) == "ar";

        /// <summary>"ar" or "en": the requested language when it is one of them, else the default.</summary>
        public static string Normalise(string requested, string defaultLanguage)
        {
            var code = string.IsNullOrWhiteSpace(requested) ? defaultLanguage : requested;
            return code != null && code.Trim().StartsWith("ar", StringComparison.OrdinalIgnoreCase) ? "ar" : "en";
        }
    }
}
