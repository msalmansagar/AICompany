using System;
using System.Linq;
using System.Net;

namespace Qdb.SurveyEngine.Dispatch
{
    /// <summary>
    /// Composes the invitation message in the customer's language from the setup's wording and the
    /// secure link (section 10). An empty wording falls back to the other language.
    /// </summary>
    public static class SurveyMessageComposer
    {
        /// <summary>The link with the token appended as a query parameter.</summary>
        public static string BuildLink(string baseUrl, string token)
        {
            if (string.IsNullOrWhiteSpace(baseUrl)) throw new ArgumentException("A secure-link base URL is required.", nameof(baseUrl));
            var trimmed = baseUrl.Trim();
            return trimmed + (trimmed.Contains("?") ? "&" : "?") + "token=" + Uri.EscapeDataString(token);
        }

        /// <summary>The message parts in <paramref name="languageCode"/>.</summary>
        public static ComposedMessage Compose(SurveyWording wording, string languageCode, string link)
        {
            var isArabic = languageCode != null && languageCode.StartsWith("ar", StringComparison.OrdinalIgnoreCase);
            var title = Pick(isArabic, wording.TitleArabic, wording.TitleEnglish);
            var message = Pick(isArabic, wording.MessageArabic, wording.MessageEnglish);
            return new ComposedMessage
            {
                Subject = title,
                SmsFullText = string.Join("\n", new[] { title, message, link }.Where(NotBlank)),
                SmsShortText = string.Join("\n", new[] { title, link }.Where(NotBlank)),
                EmailHtml = BuildEmailHtml(isArabic, message, link),
            };
        }

        private static string BuildEmailHtml(bool isArabic, string message, string link)
        {
            var direction = isArabic ? "rtl" : "ltr";
            var linkText = isArabic ? "ابدأ الاستبيان" : "Start the survey";
            var encodedLink = WebUtility.HtmlEncode(link);
            return $"<div dir=\"{direction}\"><p>{WebUtility.HtmlEncode(message ?? string.Empty).Replace("\n", "<br/>")}</p>"
                + $"<p><a href=\"{encodedLink}\">{linkText}</a></p><p>{encodedLink}</p></div>";
        }

        private static string Pick(bool isArabic, string arabic, string english) =>
            isArabic ? (NotBlank(arabic) ? arabic : english) : (NotBlank(english) ? english : arabic);

        private static bool NotBlank(string text) => !string.IsNullOrWhiteSpace(text);
    }

    /// <summary>The parts of one invitation message.</summary>
    public sealed class ComposedMessage
    {
        public string Subject { get; set; }
        public string SmsFullText { get; set; }
        public string SmsShortText { get; set; }
        public string EmailHtml { get; set; }
    }
}
