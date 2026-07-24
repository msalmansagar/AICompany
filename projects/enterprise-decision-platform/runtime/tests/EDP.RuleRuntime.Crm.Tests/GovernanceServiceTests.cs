using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using EDP.RuleRuntime.Crm.Governance;
using EDP.RuleRuntime.Crm.Sinks;
using Xunit;

namespace EDP.RuleRuntime.Crm.Tests
{
    public class GovernanceServiceTests
    {
        private const int Draft = 100000000, InReview = 100000001, Approved = 100000002, Published = 100000003;

        private static (FakeOrganizationService fake, GovernanceService gov, Guid versionId) Setup(int state)
        {
            var fake = new FakeOrganizationService();
            var id = Guid.NewGuid();
            fake.RetrieveResults["qdb_edp_ruleversion"] = new Entity("qdb_edp_ruleversion", id)
            {
                ["qdb_edp_lifecyclestate"] = new OptionSetValue(state)
            };
            return (fake, new GovernanceService(fake, new DataverseAuditSink(fake)), id);
        }

        private static int UpdatedState(FakeOrganizationService fake)
            => fake.Updated.Single().GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate").Value;

        [Fact]
        public void Submit_moves_draft_to_in_review_and_records_approval_and_audit()
        {
            var (fake, gov, id) = Setup(Draft);
            var r = gov.PerformAction(id, "Submit", "please review", Guid.NewGuid());

            Assert.True(r.Success);
            Assert.Equal("In Review", r.NewState);
            Assert.Equal(InReview, UpdatedState(fake));
            Assert.Contains(fake.Created, e => e.LogicalName == "qdb_edp_ruleapproval");
            Assert.Contains(fake.Created, e => e.LogicalName == "qdb_edp_ruleaudit");
        }

        [Fact]
        public void Two_stage_approval_business_then_technical()
        {
            var (fake, gov, id) = Setup(InReview);

            // First approval = Business → stays In Review.
            var business = gov.PerformAction(id, "Approve", "business ok", Guid.NewGuid());
            Assert.Equal("Business Approval", business.Stage);
            Assert.Equal("In Review", business.NewState);

            // Second approval = Technical → moves to Approved.
            var technical = gov.PerformAction(id, "Approve", "technical ok", Guid.NewGuid());
            Assert.Equal("Technical Approval", technical.Stage);
            Assert.Equal("Approved", technical.NewState);
            Assert.Equal(Approved, fake.Updated.Last().GetAttributeValue<OptionSetValue>("qdb_edp_lifecyclestate").Value);
        }

        [Fact]
        public void Publish_moves_approved_to_published_and_audits()
        {
            var (fake, gov, id) = Setup(Approved);
            var r = gov.PerformAction(id, "Publish", null, Guid.NewGuid());
            Assert.Equal(Published, UpdatedState(fake));
            Assert.Contains(fake.Created, e => e.LogicalName == "qdb_edp_ruleaudit");
        }

        [Fact]
        public void Unpublish_moves_published_back_to_draft()
        {
            var (fake, gov, id) = Setup(Published);
            var r = gov.PerformAction(id, "Unpublish", "pulling from production", Guid.NewGuid());
            Assert.Equal("Draft", r.NewState);
            Assert.Equal(Draft, UpdatedState(fake));
            Assert.Contains(fake.Created, e => e.LogicalName == "qdb_edp_ruleaudit");
        }

        [Fact]
        public void Unpublish_is_rejected_when_not_published()
        {
            var (_, gov, id) = Setup(Draft);
            Assert.Throws<InvalidOperationException>(() => gov.PerformAction(id, "Unpublish", null, Guid.NewGuid()));
        }

        [Fact]
        public void Illegal_transition_is_rejected()
        {
            var (_, gov, id) = Setup(Draft);
            // cannot Approve a Draft (must be In Review)
            Assert.Throws<InvalidOperationException>(() => gov.PerformAction(id, "Approve", null, Guid.NewGuid()));
        }

        [Fact]
        public void Reject_sends_in_review_back_to_draft()
        {
            var (fake, gov, id) = Setup(InReview);
            gov.PerformAction(id, "Reject", "needs work", Guid.NewGuid());
            Assert.Equal(Draft, UpdatedState(fake));
        }

        [Fact]
        public void Concurrent_action_is_rejected_and_records_nothing() // M3 — optimistic concurrency
        {
            var (fake, gov, id) = Setup(InReview);
            fake.ThrowConcurrencyOnUpdate = true; // the version row changed under us (a racing approval)

            var ex = Assert.Throws<InvalidOperationException>(() => gov.PerformAction(id, "Approve", "business ok", Guid.NewGuid()));

            Assert.Contains("Concurrent governance action", ex.Message);
            // the optimistic touch runs BEFORE the write, so no duplicate approval/audit is created
            Assert.DoesNotContain(fake.Created, e => e.LogicalName == "qdb_edp_ruleapproval");
        }
    }
}
