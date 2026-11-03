using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Xunit;

namespace Qdb.ReportEngine.CrmPlugin.Tests
{
    /// <summary>
    /// The execution log is where a failed run is explained. These cover the ways it can stop
    /// explaining: the reason lost behind a generic code, a platform fault code dropped, a cause
    /// chain truncated to its outermost link, or a multi-line fault making the column unreadable.
    /// </summary>
    public sealed class FailureDetailTests
    {
        [Fact]
        public void Describe_NamesTheTypeAndTheMessage()
        {
            var described = FailureDetail.Describe(new InvalidOperationException("top must be 5000 or less"));

            Assert.Contains("InvalidOperationException", described);
            Assert.Contains("top must be 5000 or less", described);
        }

        [Fact]
        public void Describe_KeepsTheDataverseFaultCode()
        {
            // "Parameter name: top" is in the message; 0x80040220 is only in the fault, and it is what
            // identifies a privilege failure as distinct from a malformed query.
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80040220), Message = "denied" };
            var error = new FaultException<OrganizationServiceFault>(fault, "denied");

            Assert.Contains("0x80040220", FailureDetail.Describe(error));
        }

        [Fact]
        public void Describe_FollowsTheCauseChain()
        {
            // The outermost exception is usually ours and says the least; the cause is the reason.
            var inner = new ArgumentException("Parameter name: top");
            var error = new InvalidPluginExecutionException("The report could not be completed.", inner);

            var described = FailureDetail.Describe(error);

            Assert.Contains("caused by", described);
            Assert.Contains("Parameter name: top", described);
        }

        [Fact]
        public void Describe_PutsItOnOneLine()
        {
            // Platform faults arrive with embedded newlines, and a grid column shows only the first.
            var described = FailureDetail.Describe(new Exception("first line\r\nsecond line"));

            Assert.DoesNotContain("\n", described);
            Assert.Contains("second line", described);
        }

        [Fact]
        public void Describe_WithNoException_RecordsNothing()
        {
            Assert.Null(FailureDetail.Describe(null));
        }

        [Fact]
        public void Describe_StopsFollowingAnEndlessChain()
        {
            var error = new Exception("outer", new Exception("a", new Exception("b",
                new Exception("c", new Exception("d", new Exception("deepest"))))));

            Assert.DoesNotContain("deepest", FailureDetail.Describe(error));
        }
    }
}
