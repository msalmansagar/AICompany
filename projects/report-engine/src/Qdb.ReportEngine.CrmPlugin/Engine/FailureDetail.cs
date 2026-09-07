using System;
using System.ServiceModel;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Renders an exception into the text the execution log keeps for diagnosis.
    ///
    /// Not the same thing as the message the caller receives. That one crosses a trust boundary and is
    /// deliberately vague — "The report could not be completed." — because a raw platform string leaks
    /// internal detail to whoever asked. This text is written as SYSTEM into a row only administrators
    /// read, so it carries what a person needs to act: the type, the message, the Dataverse fault code
    /// where there is one, and each inner exception. The platform's own stack trace is left out; it
    /// names our own call chain and adds length without adding a cause.
    /// </summary>
    internal static class FailureDetail
    {
        /// <summary>The field is a Memo, so there is room — but not for an unbounded chain.</summary>
        private const int MaxLength = 4000;

        private const int MaxInnerExceptions = 4;

        public static string Describe(Exception error)
        {
            if (error == null)
            {
                return null;
            }

            var text = new StringBuilder();
            var current = error;
            for (var depth = 0; current != null && depth <= MaxInnerExceptions; depth++)
            {
                if (depth > 0)
                {
                    text.Append(" <- caused by ");
                }

                Append(text, current);
                current = current.InnerException;
            }

            var described = text.ToString();
            return described.Length > MaxLength ? described.Substring(0, MaxLength) : described;
        }

        private static void Append(StringBuilder text, Exception error)
        {
            text.Append(error.GetType().Name).Append(": ").Append(Flatten(error.Message));

            // The fault carries the code Dataverse rejected the call with, which is the part that
            // identifies the problem — "Parameter name: top" is in the message, 0x80040220 is not.
            var fault = (error as FaultException<OrganizationServiceFault>)?.Detail;
            if (fault != null)
            {
                text.Append(" [dataverse 0x").Append(fault.ErrorCode.ToString("X8")).Append(']');
            }
        }

        /// <summary>
        /// One line. Platform faults arrive with embedded newlines and timestamps, and a log column
        /// read in a grid shows only the first line of whatever it is given.
        /// </summary>
        private static string Flatten(string message) =>
            string.IsNullOrEmpty(message)
                ? string.Empty
                : message.Replace("\r\n", " ").Replace('\n', ' ').Replace('\r', ' ').Trim();
    }
}
