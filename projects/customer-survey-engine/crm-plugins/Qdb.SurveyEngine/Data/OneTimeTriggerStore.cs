using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Reads One-time triggers with their setup (active or not) and writes their run record (Addendum D,
    /// D.2). Starting a send is conditional on the row version, so a form and the scheduler cannot both start it.
    /// </summary>
    public sealed class OneTimeTriggerStore : IOneTimeTriggerStore
    {
        private const int RowVersionMismatchError = unchecked((int)0x80060882);
        private const char CursorSeparator = '|';

        private static readonly string[] TriggerColumns =
        {
            "qdb_trigger_kind", "qdb_status_values", "qdb_type_values", "qdb_priority", "qdb_fatigue_action", "createdon", "qdb_is_active",
            "qdb_audience", "qdb_audience_fetchxml", "qdb_send_on", "qdb_run_status", "qdb_run_cursor", "qdb_sent_on",
            "qdb_invited_count", "qdb_postponed_count", "qdb_suppressed_count", "versionnumber",
        };

        private readonly IOrganizationService _service;

        public OneTimeTriggerStore(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public OneTimeTrigger Find(Guid triggerId)
        {
            var query = BaseQuery();
            query.Criteria.AddCondition("qdb_survey_triggerid", ConditionOperator.Equal, triggerId);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row == null ? null : Map(row);
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> GetDueTriggerIds(DateTime nowUtc)
        {
            var query = BaseQuery();
            query.ColumnSet = new ColumnSet(false);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_send_on", ConditionOperator.LessEqual, nowUtc);
            query.Criteria.AddCondition("qdb_run_status", ConditionOperator.In, (int)OneTimeRunStatus.NotSent, (int)OneTimeRunStatus.Sending);
            query.LinkEntities[0].LinkCriteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.AddOrder("qdb_send_on", OrderType.Ascending);
            return _service.RetrieveMultiple(query).Entities.Select(row => row.Id).ToList();
        }

        /// <inheritdoc />
        public bool TryStart(OneTimeTrigger trigger, DateTime nowUtc)
        {
            var change = RunRecord(trigger.Trigger.Id, new OneTimeRunState { Status = OneTimeRunStatus.Sending });
            change["qdb_run_started_on"] = nowUtc;
            change["qdb_run_message"] = null;
            change.RowVersion = trigger.Run.RowVersion;
            try
            {
                _service.Execute(new UpdateRequest { Target = change, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
                return true;
            }
            catch (FaultException<OrganizationServiceFault> fault) when (fault.Detail.ErrorCode == RowVersionMismatchError)
            {
                return false;
            }
        }

        /// <inheritdoc />
        public void SaveProgress(Guid triggerId, OneTimeRunState state) => _service.Update(RunRecord(triggerId, state));

        /// <inheritdoc />
        public void Complete(Guid triggerId, OneTimeRunState state)
        {
            var change = RunRecord(triggerId, state);
            change["qdb_sent_on"] = state.SentOn;
            _service.Update(change);
        }

        /// <inheritdoc />
        public void Fail(Guid triggerId, string reason) => _service.Update(new Entity("qdb_survey_trigger", triggerId)
        {
            ["qdb_run_status"] = new OptionSetValue((int)OneTimeRunStatus.Failed),
            ["qdb_run_message"] = Truncate(reason, 2000),
        });

        private static QueryExpression BaseQuery()
        {
            var query = new QueryExpression("qdb_survey_trigger") { ColumnSet = new ColumnSet(TriggerColumns) };
            query.Criteria.AddCondition("qdb_trigger_kind", ConditionOperator.Equal, (int)TriggerKind.OneTime);
            // Every setup, active or not (not the shared active-only link): Send must say "switch the setup on", not "not found".
            query.LinkEntities.Add(new LinkEntity("qdb_survey_trigger", "qdb_survey_setup", "qdb_survey_setup_id", "qdb_survey_setupid", JoinOperator.Inner)
            {
                EntityAlias = SurveyConfigMapping.SetupAlias,
                Columns = new ColumnSet("qdb_survey_setupid", "qdb_form_code", "qdb_delivery_digital", "qdb_delivery_legacy", "qdb_active_from", "qdb_active_to", "qdb_expiry_days", "qdb_is_active"),
            });
            return query;
        }

        private static OneTimeTrigger Map(Entity row) => new OneTimeTrigger
        {
            Trigger = SurveyConfigMapping.MapTrigger(row),
            IsTriggerActive = row.GetAttributeValue<bool?>("qdb_is_active") ?? false,
            IsSetupActive = row.GetAttributeValue<AliasedValue>(SurveyConfigMapping.SetupAlias + ".qdb_is_active")?.Value as bool? ?? false,
            Audience = (AudienceKind?)row.GetAttributeValue<OptionSetValue>("qdb_audience")?.Value ?? AudienceKind.AllActiveCustomers,
            AudienceFetchXml = row.GetAttributeValue<string>("qdb_audience_fetchxml"),
            SendOn = row.GetAttributeValue<DateTime?>("qdb_send_on"),
            Run = MapRun(row),
        };

        private static OneTimeRunState MapRun(Entity row)
        {
            var cursor = ParseCursor(row.GetAttributeValue<string>("qdb_run_cursor"));
            return new OneTimeRunState
            {
                Status = (OneTimeRunStatus?)row.GetAttributeValue<OptionSetValue>("qdb_run_status")?.Value ?? OneTimeRunStatus.NotSent,
                NextPage = cursor.Item1,
                PagingCookie = cursor.Item2,
                SentOn = row.GetAttributeValue<DateTime?>("qdb_sent_on"),
                RowVersion = row.RowVersion,
                Counts = new OneTimeCounts
                {
                    Invited = row.GetAttributeValue<int?>("qdb_invited_count") ?? 0,
                    Postponed = row.GetAttributeValue<int?>("qdb_postponed_count") ?? 0,
                    Suppressed = row.GetAttributeValue<int?>("qdb_suppressed_count") ?? 0,
                },
            };
        }

        private static Entity RunRecord(Guid triggerId, OneTimeRunState state) => new Entity("qdb_survey_trigger", triggerId)
        {
            ["qdb_run_status"] = new OptionSetValue((int)state.Status),
            ["qdb_run_cursor"] = FormatCursor(state),
            ["qdb_invited_count"] = state.Counts.Invited,
            ["qdb_postponed_count"] = state.Counts.Postponed,
            ["qdb_suppressed_count"] = state.Counts.Suppressed,
        };

        /// <summary>"{next page}|{paging cookie}"; public so tests can check the round trip.</summary>
        public static string FormatCursor(OneTimeRunState state) =>
            state.NextPage.ToString(CultureInfo.InvariantCulture) + CursorSeparator + (state.PagingCookie ?? string.Empty);

        /// <summary>Next page and cookie from a stored cursor; page 1 and no cookie when empty or unreadable.</summary>
        public static Tuple<int, string> ParseCursor(string cursor)
        {
            var separator = string.IsNullOrEmpty(cursor) ? -1 : cursor.IndexOf(CursorSeparator);
            int page;
            if (separator < 1 || !int.TryParse(cursor.Substring(0, separator), NumberStyles.Integer, CultureInfo.InvariantCulture, out page) || page < 1)
                return Tuple.Create(1, (string)null);
            var cookie = cursor.Substring(separator + 1);
            return Tuple.Create(page, cookie.Length == 0 ? null : cookie);
        }

        private static string Truncate(string text, int maxLength) =>
            text == null || text.Length <= maxLength ? text : text.Substring(0, maxLength);
    }
}
