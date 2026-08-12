using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>The outcome of validating a payload before it reaches a citizen.</summary>
    public sealed class ValidationResult
    {
        private ValidationResult(bool isRejected, string message)
        {
            IsRejected = isRejected;
            Message = message;
        }

        public bool IsRejected { get; }

        /// <summary>Rejection reason, or the warning text, or empty when clean.</summary>
        public string Message { get; }

        public static ValidationResult Accepted() => new ValidationResult(false, string.Empty);

        public static ValidationResult Warned(string message) => new ValidationResult(false, message);

        public static ValidationResult Rejected(string message) => new ValidationResult(true, message);
    }

    /// <summary>
    /// Applies the publish-time gate from ADR-CMS-001 and FR-65.
    /// </summary>
    /// <remarks>
    /// This lives in the plugin rather than the editor because browser-side
    /// enforcement is bypassable by a direct Web API write. The same reasoning
    /// puts the audit row here (FR-64) and icon sanitisation in its own message.
    /// </remarks>
    public static class PublishValidator
    {
        private static readonly Regex DataUri =
            new Regex(@"data:[a-z]+/[a-z0-9.+-]+;base64,", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        /// <summary>
        /// Validates the raw JSON and its stored form together, because one rule
        /// reads the content and the other measures what storing it costs.
        /// </summary>
        public static ValidationResult Validate(string json, string stored)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            if (stored == null) throw new ArgumentNullException(nameof(stored));

            var inlinedBinary = FindInlinedBinary(json);
            if (inlinedBinary != null)
            {
                return ValidationResult.Rejected(
                    "Publish rejected: the page contains an inlined " + inlinedBinary +
                    ". Images must be library references (FR-14), not embedded data.");
            }

            var share = PagePayload.ShareOfLimit(stored);
            if (share > PagePayload.RejectThreshold)
            {
                return ValidationResult.Rejected(FormatSizeMessage("Publish rejected", stored, share));
            }

            if (share > PagePayload.WarnThreshold)
            {
                return ValidationResult.Warned(FormatSizeMessage("Published with a warning", stored, share));
            }

            return ValidationResult.Accepted();
        }

        /// <summary>Answers which kind of binary was inlined, or null if none was.</summary>
        private static string FindInlinedBinary(string json)
        {
            var match = DataUri.Match(json);
            return match.Success ? match.Value.TrimEnd(';', 'b', 'a', 's', 'e', '6', '4', ',') : null;
        }

        /// <summary>
        /// The message states the measured size, because "too large" without a
        /// number tells an author nothing about what to remove.
        /// </summary>
        private static string FormatSizeMessage(string prefix, string stored, double share)
        {
            return string.Format(
                "{0}: stored payload is {1:N0} characters, {2:P1} of the {3:N0} limit.",
                prefix, stored.Length, share, PagePayload.MemoLimit);
        }
    }
}
