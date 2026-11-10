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
            switch (trigger.Kind)
            {
                case TriggerKind.Event:
                    return IsTypeAllowed(trigger.TypeValues, change) && change.Message == ChangeMessage.Update && EntersSet(trigger.StatusValues, change);
                case TriggerKind.Created:
                    return IsTypeAllowed(trigger.TypeValues, change) && change.Message == ChangeMessage.Create
                        && (trigger.StatusValues.IsEmpty || trigger.StatusValues.Contains(change.NewStatus));
                case TriggerKind.Milestone:
                    return IsTypeAllowed(trigger.Milestone.TypeValues, change) && EntersCountedStatus(trigger.Milestone.StatusValues, change);
                default:
                    return false;
            }
        }

        // A milestone is only worth counting when a record has just become qualifying.
        private static bool EntersCountedStatus(CodeList counted, RecordChange change) =>
            change.Message == ChangeMessage.Create ? counted.Contains(change.NewStatus) : EntersSet(counted, change);

        private static bool EntersSet(CodeList set, RecordChange change) =>
            !set.Contains(change.OldStatus) && set.Contains(change.NewStatus);

        private static bool IsTypeAllowed(CodeList types, RecordChange change) => types.IsEmpty || types.Contains(change.Type);
    }

    /// <summary>Which milestone index, if any, a customer has just reached (FR-CSE-034, 037, 038, 039).</summary>
    public static class MilestoneRule
    {
        /// <summary>
        /// floor(count / N) when it is above every index already fired and, with skip-reached, above the
        /// activation baseline; otherwise null. Only the current index fires, never a backlog.
        /// </summary>
        public static int? IndexToFire(MilestoneSettings settings, MilestoneCounts counts)
        {
            if (settings.EveryN < 1) return null;
            var reached = counts.Qualifying / settings.EveryN;
            var alreadyCovered = Math.Max(counts.LastFiredIndex, settings.SkipReached ? counts.QualifyingBeforeActivation / settings.EveryN : 0);
            return reached > alreadyCovered ? reached : (int?)null;
        }
    }

    /// <summary>The live counts a milestone decision needs.</summary>
    public sealed class MilestoneCounts
    {
        public int Qualifying { get; set; }
        public int QualifyingBeforeActivation { get; set; }
        public int LastFiredIndex { get; set; }
    }

    /// <summary>Priority between triggers firing for the same customer at once (FR-CSE-043).</summary>
    public static class PriorityRule
    {
        public const int DefaultMilestonePriority = 0;
        public const int DefaultOtherPriority = 100;

        /// <summary>The configured priority, or milestone 0 / others 100 so milestones win by default.</summary>
        public static int EffectivePriority(SurveyTrigger trigger) =>
            trigger.Priority ?? (trigger.Kind == TriggerKind.Milestone ? DefaultMilestonePriority : DefaultOtherPriority);

        /// <summary>Winner first: lowest priority, then milestone before others, then trigger id for a stable order.</summary>
        public static int Compare(SurveyTrigger first, SurveyTrigger second)
        {
            var byPriority = EffectivePriority(first).CompareTo(EffectivePriority(second));
            if (byPriority != 0) return byPriority;
            var byKind = (second.Kind == TriggerKind.Milestone).CompareTo(first.Kind == TriggerKind.Milestone);
            return byKind != 0 ? byKind : first.Id.CompareTo(second.Id);
        }
    }

    /// <summary>The per-customer invitation limit (FR-CSE-040, 041).</summary>
    public static class FatiguePolicy
    {
        /// <summary>The earliest generation time that still blocks a new invitation, or null when the limit is off.</summary>
        public static DateTime? BlockingSince(SurveySettings settings, DateTime nowUtc) =>
            settings.FatigueMinDays > 0 ? nowUtc.AddDays(-settings.FatigueMinDays) : (DateTime?)null;

        /// <summary>The trigger's own setting, else Drop for event/created and Postpone for milestone/scheduled.</summary>
        public static FatigueAction ActionFor(SurveyTrigger trigger)
        {
            if (trigger.FatigueAction.HasValue) return trigger.FatigueAction.Value;
            return trigger.Kind == TriggerKind.Milestone || trigger.Kind == TriggerKind.Scheduled ? FatigueAction.Postpone : FatigueAction.Drop;
        }
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

        /// <summary>
        /// {setupId}|{customerId}|M{index}: one key per milestone index, whichever record reached it,
        /// so an index can fire only once per customer (FR-CSE-038).
        /// </summary>
        public static string ForMilestone(Guid setupId, Guid customerId, int index) =>
            string.Format("{0:D}|{1:D}|M{2}", setupId, customerId, index);

        /// <summary>{setupId}|{customerId}|{periodKey}: one invitation per calendar period (FR-CSE-033, 044).</summary>
        public static string ForSchedule(Guid setupId, Guid customerId, string periodKey) =>
            string.Format("{0:D}|{1:D}|{2}", setupId, customerId, periodKey);

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
