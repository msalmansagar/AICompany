using System;
using System.Globalization;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>qdb_survey_trigger.qdb_schedule_period (FR-CSE-031).</summary>
    public enum SchedulePeriod
    {
        Monthly = 100000000,
        Quarterly = 100000001,
        Annually = 100000002,
    }

    /// <summary>qdb_survey_trigger.qdb_schedule_population (FR-CSE-032).</summary>
    public enum SchedulePopulation
    {
        AllActiveCustomers = 100000000,
        ActiveInPeriod = 100000001,
    }

    /// <summary>The calendar period a scheduled run surveys: [Start, EndExclusive) and its key, e.g. 2026-Q1.</summary>
    public sealed class ReviewedPeriod
    {
        public ReviewedPeriod(DateTime start, DateTime endExclusive, string key)
        {
            Start = start;
            EndExclusive = endExclusive;
            Key = key ?? throw new ArgumentNullException(nameof(key));
        }

        public DateTime Start { get; }
        public DateTime EndExclusive { get; }

        /// <summary>qdb_schedule_period_key: 2026-03 (monthly), 2026-Q1 (quarterly), 2025 (annually).</summary>
        public string Key { get; }
    }

    /// <summary>
    /// Calendar rules of scheduled triggers (FR-CSE-031, 016). A trigger is due on the 1st of its
    /// period and surveys the period that has just ended: on 1 April a quarterly trigger surveys Q1,
    /// so "active in period" finds customers with Q1 activity and the invitation stays open until
    /// 1 May (AC14.1).
    /// </summary>
    public static class ScheduleCalendar
    {
        /// <summary>True on the 1st of the month (monthly), of Jan/Apr/Jul/Oct (quarterly) or of January (annually).</summary>
        public static bool IsDue(SchedulePeriod period, DateTime runDate)
        {
            if (runDate.Day != 1) return false;
            switch (period)
            {
                case SchedulePeriod.Monthly: return true;
                case SchedulePeriod.Quarterly: return (runDate.Month - 1) % 3 == 0;
                case SchedulePeriod.Annually: return runDate.Month == 1;
                default: return false;
            }
        }

        /// <summary>The period ending on <paramref name="runDate"/> (exclusive), which the run surveys.</summary>
        public static ReviewedPeriod PeriodEndingOn(SchedulePeriod period, DateTime runDate)
        {
            var end = runDate.Date;
            switch (period)
            {
                case SchedulePeriod.Monthly:
                    var month = end.AddMonths(-1);
                    return new ReviewedPeriod(month, end, month.ToString("yyyy-MM", CultureInfo.InvariantCulture));
                case SchedulePeriod.Quarterly:
                    var quarter = end.AddMonths(-3);
                    return new ReviewedPeriod(quarter, end, string.Format(CultureInfo.InvariantCulture, "{0}-Q{1}", quarter.Year, (quarter.Month - 1) / 3 + 1));
                case SchedulePeriod.Annually:
                    var year = end.AddYears(-1);
                    return new ReviewedPeriod(year, end, year.Year.ToString(CultureInfo.InvariantCulture));
                default:
                    throw new ArgumentOutOfRangeException(nameof(period), period, "Unknown schedule period.");
            }
        }

        /// <summary>
        /// The period a stored key names (the inverse of <see cref="PeriodEndingOn"/>), so an unfinished run resumes
        /// for the period it started on whatever the run date is now (FR-006, ADR-011).
        /// </summary>
        public static ReviewedPeriod PeriodFromKey(SchedulePeriod period, string key)
        {
            var start = ParsePeriodStart(period, key ?? string.Empty);
            switch (period)
            {
                case SchedulePeriod.Monthly: return new ReviewedPeriod(start, start.AddMonths(1), key);
                case SchedulePeriod.Quarterly: return new ReviewedPeriod(start, start.AddMonths(3), key);
                default: return new ReviewedPeriod(start, start.AddYears(1), key);
            }
        }

        private static DateTime ParsePeriodStart(SchedulePeriod period, string key)
        {
            var culture = CultureInfo.InvariantCulture;
            switch (period)
            {
                case SchedulePeriod.Monthly:
                    return DateTime.ParseExact(key, "yyyy-MM", culture, DateTimeStyles.None);
                case SchedulePeriod.Quarterly:
                    return ParseQuarterStart(key);
                case SchedulePeriod.Annually:
                    return DateTime.ParseExact(key, "yyyy", culture, DateTimeStyles.None);
                default:
                    throw new ArgumentOutOfRangeException(nameof(period), period, "Unknown schedule period.");
            }
        }

        /// <summary>
        /// The period right after <paramref name="reviewed"/>; it falls due on its own end date (its EndExclusive), the 1st on
        /// which the trigger surveys it (FR-006: it waits while its predecessor is unfinished).
        /// </summary>
        public static ReviewedPeriod FollowingPeriod(SchedulePeriod period, ReviewedPeriod reviewed)
        {
            if (reviewed == null) throw new ArgumentNullException(nameof(reviewed));
            var start = reviewed.EndExclusive;
            switch (period)
            {
                case SchedulePeriod.Monthly: return PeriodEndingOn(period, start.AddMonths(1));
                case SchedulePeriod.Quarterly: return PeriodEndingOn(period, start.AddMonths(3));
                case SchedulePeriod.Annually: return PeriodEndingOn(period, start.AddYears(1));
                default: throw new ArgumentOutOfRangeException(nameof(period), period, "Unknown schedule period.");
            }
        }

        private static DateTime ParseQuarterStart(string key)
        {
            var culture = CultureInfo.InvariantCulture;
            var parts = key.Split(new[] { "-Q" }, StringSplitOptions.None);
            int year, quarter;
            if (parts.Length != 2 || parts[0].Length != 4 || !int.TryParse(parts[0], NumberStyles.None, culture, out year)
                || !int.TryParse(parts[1], NumberStyles.None, culture, out quarter) || quarter < 1 || quarter > 4)
                throw new FormatException($"'{key}' is not a quarterly period key such as 2026-Q4.");
            return new DateTime(year, (quarter - 1) * 3 + 1, 1);
        }

        /// <summary>
        /// A quarterly invitation's fixed expiry: one month into the following quarter (FR-CSE-016).
        /// Other periods use the setup's expiry days, so they answer null.
        /// </summary>
        public static DateTime? FixedExpiry(SchedulePeriod period, ReviewedPeriod reviewed) =>
            period == SchedulePeriod.Quarterly ? DateTime.SpecifyKind(reviewed.EndExclusive.AddMonths(1), DateTimeKind.Utc) : (DateTime?)null;
    }
}
