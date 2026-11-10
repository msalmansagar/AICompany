using System;
using System.Security.Cryptography;
using System.Text;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>Decides whether a trigger fires for a record change (section 6.2, FR-CSE-026..029).</summary>
    public static class TriggerMatcher
    {
        /// <summary>
        /// Event: Update where the status moved from outside the set to inside it; a save inside
        /// the set, or with no status change, never fires. Created: Create, optionally limited to
        /// an initial status set. Both honour the optional type filter. Other kinds are not
        /// event-driven (scheduled and milestone run elsewhere).
        /// </summary>
        public static bool Matches(SurveyTrigger trigger, RecordChange change)
        {
            if (!IsTypeAllowed(trigger, change)) return false;
            switch (trigger.Kind)
            {
                case TriggerKind.Event:
                    return change.Message == ChangeMessage.Update
                        && !trigger.StatusValues.Contains(change.OldStatus)
                        && trigger.StatusValues.Contains(change.NewStatus);
                case TriggerKind.Created:
                    return change.Message == ChangeMessage.Create
                        && (trigger.StatusValues.IsEmpty || trigger.StatusValues.Contains(change.NewStatus));
                default:
                    return false;
            }
        }

        private static bool IsTypeAllowed(SurveyTrigger trigger, RecordChange change) =>
            trigger.TypeValues.IsEmpty || trigger.TypeValues.Contains(change.Type);
    }

    /// <summary>Picks the delivery for a request from its Digital/Legacy origin (FR-CSE-010, 011).</summary>
    public static class ChannelResolver
    {
        /// <summary>A source with no origin field treats every request as Digital (section 4.11).</summary>
        public static DeliveryChoice Resolve(SurveySource source, SurveySetup setup, RecordChange change)
        {
            var isDigital = string.IsNullOrWhiteSpace(source.Fields.Origin)
                || source.Fields.DigitalOriginValues.Contains(change.Origin);
            return isDigital ? setup.DeliveryDigital : setup.DeliveryLegacy;
        }
    }

    /// <summary>The setup's active window (FR-CSE-014).</summary>
    public static class ActiveWindow
    {
        /// <summary>True when today (UTC date) lies within ActiveFrom..ActiveTo, both inclusive.</summary>
        public static bool IsOpen(SurveySetup setup, DateTime nowUtc)
        {
            var today = nowUtc.Date;
            if (setup.ActiveFrom.HasValue && today < setup.ActiveFrom.Value.Date) return false;
            return !setup.ActiveTo.HasValue || today <= setup.ActiveTo.Value.Date;
        }
    }

    /// <summary>
    /// The invitation's dedupe key, enforced by the qdb_invitation_dedupe alternate key so one
    /// event can never produce two invitations (FR-CSE-044, NFR-CSE-002).
    /// </summary>
    public static class DedupeKey
    {
        /// <summary>Length of qdb_survey_invitation.qdb_dedupe_key.</summary>
        public const int MaxLength = 200;

        /// <summary>{setupId}|{customerId}|{table}:{recordId}, hashed only if it would not fit the column.</summary>
        public static string ForRecord(Guid setupId, Guid customerId, RecordChange change)
        {
            var key = string.Format("{0:D}|{1:D}|{2}:{3:D}", setupId, customerId, change.TableLogicalName, change.RecordId);
            return key.Length <= MaxLength ? key : "sha256:" + Sha256Hex(key);
        }

        private static string Sha256Hex(string text)
        {
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(text));
                var builder = new StringBuilder(hash.Length * 2);
                foreach (var b in hash) builder.Append(b.ToString("x2"));
                return builder.ToString();
            }
        }
    }

    /// <summary>Normalises a customer's stored language to the render cache's code ("en" / "ar").</summary>
    public static class LanguageCode
    {
        private const int ArabicLcid = 1025;
        private const int EnglishLcid = 1033;

        /// <summary>
        /// Accepts "ar", "ar-QA", "Arabic", 1025, "1025" and the English equivalents; anything else
        /// falls back to <paramref name="defaultLanguage"/>.
        /// </summary>
        public static string Normalise(object storedValue, string defaultLanguage)
        {
            var text = storedValue?.ToString().Trim();
            if (string.IsNullOrEmpty(text)) return defaultLanguage;
            int lcid;
            if (int.TryParse(text, out lcid)) return lcid == ArabicLcid ? "ar" : lcid == EnglishLcid ? "en" : defaultLanguage;
            var prefix = text.Length >= 2 ? text.Substring(0, 2).ToLowerInvariant() : text.ToLowerInvariant();
            return prefix == "ar" || prefix == "en" ? prefix : defaultLanguage;
        }
    }
}
