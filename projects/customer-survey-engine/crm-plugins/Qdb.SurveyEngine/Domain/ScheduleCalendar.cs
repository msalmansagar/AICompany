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
        /// A quarterly invitation's fixed expiry: one month into the following quarter (FR-CSE-016).
        /// Other periods use the setup's expiry days, so they answer null.
        /// </summary>
        public static DateTime? FixedExpiry(SchedulePeriod period, ReviewedPeriod reviewed) =>
            period == SchedulePeriod.Quarterly ? DateTime.SpecifyKind(reviewed.EndExclusive.AddMonths(1), DateTimeKind.Utc) : (DateTime?)null;
    }
}
