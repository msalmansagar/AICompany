using System;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Model;

namespace Qdb.ReportEngine.CrmPlugin.Infrastructure
{
    /// <summary>Reads and validates the typed <see cref="RunReportRequest"/> from the plugin context.</summary>
    internal static class RunReportRequestReader
    {
        public static RunReportRequest Read(IPluginExecutionContext context)
        {
            var reportId = ParseRequiredGuid(GetString(context, ReportEngineParameters.ReportId), ReportEngineParameters.ReportId);
            var callerId = ResolveCaller(context);
            var parametersJson = GetString(context, ReportEngineParameters.ParametersJson);
            var format = ReportFormatExtensions.Parse(GetString(context, ReportEngineParameters.Format));
            var async = GetBool(context, ReportEngineParameters.Async);

            return new RunReportRequest(reportId, callerId, parametersJson, format, async);
        }

        // The CRM session is authoritative for identity — the caller cannot spoof another user here.
        private static Guid ResolveCaller(IPluginExecutionContext context)
        {
            var caller = context.InitiatingUserId != Guid.Empty ? context.InitiatingUserId : context.UserId;
            if (caller == Guid.Empty)
            {
                throw new InvalidPluginExecutionException("The report run has no authenticated caller.");
            }

            return caller;
        }

        private static Guid ParseRequiredGuid(string value, string name)
        {
            if (!Guid.TryParse(value, out var id) || id == Guid.Empty)
            {
                throw new InvalidPluginExecutionException($"'{name}' must be a non-empty GUID.");
            }

            return id;
        }

        private static string GetString(IPluginExecutionContext context, string key) =>
            context.InputParameters.TryGetValue(key, out var value) ? value as string : null;

        private static bool GetBool(IPluginExecutionContext context, string key) =>
            context.InputParameters.TryGetValue(key, out var value) && value is bool flag && flag;
    }
}
