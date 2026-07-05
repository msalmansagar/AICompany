using System;
using Microsoft.Xrm.Sdk;

namespace EDP.RuleRuntime.Crm.Sinks
{
    public sealed class AuditEvent
    {
        public Guid? RuleVersionId { get; set; }
        public string Action { get; set; } = "";
        public string Actor { get; set; } = "";
        public string Details { get; set; } = "";
        public DateTime TimestampUtc { get; set; }
    }

    public sealed class TraceRecord
    {
        public Guid? RuleVersionId { get; set; }
        public string ResolvedVersion { get; set; } = "";
        public string? WouldResolveVersion { get; set; }
        public string Outcome { get; set; } = "";
        public long DurationMs { get; set; }
        public string Actor { get; set; } = "";
        public DateTime ExecutedOnUtc { get; set; }
    }

    /// <summary>Durable, synchronous governance audit (ADR-13 tier 1). Failures propagate.</summary>
    public interface IAuditSink { void WriteAudit(AuditEvent auditEvent); }

    /// <summary>Best-effort execution trace (ADR-13 tier 2). Must NEVER throw to the caller.</summary>
    public interface ITraceSink { void WriteTrace(TraceRecord trace); }

    /// <summary>Writes an append-only audit record to qdb_edp_ruleaudit. Durable: throws on failure.</summary>
    public sealed class DataverseAuditSink : IAuditSink
    {
        private readonly IOrganizationService _service;
        public DataverseAuditSink(IOrganizationService service) => _service = service;

        public void WriteAudit(AuditEvent e)
        {
            var record = new Entity("qdb_edp_ruleaudit")
            {
                ["qdb_edp_ruleauditname"] = $"{e.Action} @ {e.TimestampUtc:o}",
                ["qdb_edp_action"] = e.Action,
                ["qdb_edp_actor"] = e.Actor,
                ["qdb_edp_details"] = e.Details,
                ["qdb_edp_auditedon"] = e.TimestampUtc
            };
            if (e.RuleVersionId.HasValue)
                record["qdb_edp_ruleversionid"] = new EntityReference("qdb_edp_ruleversion", e.RuleVersionId.Value);

            _service.Create(record); // durable: any failure is a real audit failure and must surface
        }
    }

    /// <summary>
    /// Writes execution telemetry to qdb_edp_ruleexecutionlog. Best-effort (ADR-13):
    /// under throttle or failure the trace is dropped, never blocking or failing the
    /// decision. Decision integrity outranks trace completeness.
    /// </summary>
    public sealed class DataverseTraceSink : ITraceSink
    {
        private readonly IOrganizationService _service;
        private readonly Action<string>? _onDrop;

        public DataverseTraceSink(IOrganizationService service, Action<string>? onDrop = null)
        {
            _service = service;
            _onDrop = onDrop;
        }

        public void WriteTrace(TraceRecord t)
        {
            try
            {
                var record = new Entity("qdb_edp_ruleexecutionlog")
                {
                    ["qdb_edp_ruleexecutionlogname"] = $"{t.Outcome} @ {t.ExecutedOnUtc:o}",
                    ["qdb_edp_resolvedversion"] = t.ResolvedVersion,
                    ["qdb_edp_wouldresolveversion"] = t.WouldResolveVersion ?? t.ResolvedVersion,
                    ["qdb_edp_outcome"] = t.Outcome,
                    ["qdb_edp_durationms"] = (int)t.DurationMs,
                    ["qdb_edp_actor"] = t.Actor,
                    ["qdb_edp_executedon"] = t.ExecutedOnUtc
                };
                if (t.RuleVersionId.HasValue)
                    record["qdb_edp_ruleversionid"] = new EntityReference("qdb_edp_ruleversion", t.RuleVersionId.Value);

                _service.Create(record);
            }
            catch (Exception ex)
            {
                // Swallow — trace loss under load is acceptable and logged; a decision never fails on trace.
                _onDrop?.Invoke(ex.Message);
            }
        }
    }
}
