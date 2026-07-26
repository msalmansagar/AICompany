using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Classifies a failed run into a stable error code and a message safe to show a user.
    ///
    /// Access failures deserve their own code because they are the expected outcome for anyone
    /// without a reporting role, not a malfunction. Left unclassified they surface as
    /// "unexpected_error" carrying a raw platform string ("ThrowCrmSecurityException: The user with
    /// id … prvReadqdb_ReportDefinition"), which tells the user nothing and leaks internal detail.
    /// </summary>
    internal static class ReportFailure
    {
        /// <summary>Dataverse <c>PrivilegeDenied</c> (0x80040220) — the caller's roles do not permit the read.</summary>
        private const int PrivilegeDenied = unchecked((int)0x80040220);

        /// <summary>Dataverse <c>AccessDenied</c> (0x80040201) — the caller may not access the record.</summary>
        private const int AccessDenied = unchecked((int)0x80040201);

        public const string PermissionDenied = "permission_denied";

        public static ReportFailureInfo Classify(Exception error)
        {
            if (IsAccessFailure(error))
            {
                return new ReportFailureInfo(PermissionDenied,
                    "You do not have access to this report, or to the data it reads. "
                    + "Ask an administrator for a role that grants read access to the Report Engine tables.");
            }

            if (error is InvalidPluginExecutionException)
            {
                return new ReportFailureInfo("report_failed", error.Message);
            }

            return new ReportFailureInfo("unexpected_error", "The report could not be completed.");
        }

        private static bool IsAccessFailure(Exception error)
        {
            var fault = (error as FaultException<OrganizationServiceFault>)?.Detail;
            if (fault == null)
            {
                return false;
            }

            // Matched on the code rather than the message: the wording is localised and version-specific.
            return fault.ErrorCode == PrivilegeDenied || fault.ErrorCode == AccessDenied;
        }
    }

    /// <summary>A classified failure: the code the caller branches on, and the text shown to a user.</summary>
    internal sealed class ReportFailureInfo
    {
        public ReportFailureInfo(string code, string message)
        {
            Code = code;
            Message = message;
        }

        public string Code { get; }

        public string Message { get; }
    }
}
