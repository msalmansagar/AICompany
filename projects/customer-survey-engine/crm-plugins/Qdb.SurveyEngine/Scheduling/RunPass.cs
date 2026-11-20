namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Which passes one Run Due Surveys call runs (DEF-CSE-002). A Custom API call is one database transaction, so
    /// the scheduler calls <see cref="OneTime"/> and <see cref="Daily"/> separately: a failure in one then rolls
    /// back only its own work and cannot stop the other from running.
    /// </summary>
    public enum RunPass
    {
        /// <summary>Both, One-time first (the behaviour before the Pass input existed).</summary>
        All = 0,

        /// <summary>Only the due One-time triggers.</summary>
        OneTime = 1,

        /// <summary>Only the once-a-day passes: postponed release, scheduled triggers, retention.</summary>
        Daily = 2,
    }
}
