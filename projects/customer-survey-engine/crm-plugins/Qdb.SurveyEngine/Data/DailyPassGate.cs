using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Keeps the last run date whose daily passes completed in qdb_survey_settings.
    /// qdb_daily_passes_completed_on (a date-only column), so the 15-minute scheduler runs them once a day.
    /// Without a settings row nothing is remembered and the passes run on every call, as before Addendum D.
    /// </summary>
    public sealed class DailyPassGate : IDailyPassGate
    {
        private const string Column = "qdb_daily_passes_completed_on";
        private readonly IOrganizationService _service;

        public DailyPassGate(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public bool HasCompleted(DateTime runDate)
        {
            var completedOn = FindSettings()?.GetAttributeValue<DateTime?>(Column);
            return completedOn.HasValue && completedOn.Value.Date == runDate.Date;
        }

        /// <inheritdoc />
        public void MarkCompleted(DateTime runDate)
        {
            var settings = FindSettings();
            if (settings == null) return;
            _service.Update(new Entity("qdb_survey_settings", settings.Id) { [Column] = runDate.Date });
        }

        private Entity FindSettings()
        {
            var query = new QueryExpression("qdb_survey_settings") { ColumnSet = new ColumnSet(Column), TopCount = 1 };
            query.AddOrder("createdon", OrderType.Ascending);
            return _service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }
    }
}
