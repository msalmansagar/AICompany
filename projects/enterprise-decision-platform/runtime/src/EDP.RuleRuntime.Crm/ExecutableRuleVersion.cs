using System;

namespace EDP.RuleRuntime.Crm
{
    /// <summary>
    /// A rule version resolved for execution: the PCRM to run plus the identity that the
    /// EvaluateDecision provenance reports (FR-B4-02). Identity fields are null for ad-hoc PcrmJson.
    /// </summary>
    public sealed class ExecutableRuleVersion
    {
        public ExecutableRuleVersion(string pcrm, Guid? ruleVersionId, Guid? ruleId, int? versionNumber, string? ruleKey)
        {
            Pcrm = pcrm;
            RuleVersionId = ruleVersionId;
            RuleId = ruleId;
            VersionNumber = versionNumber;
            RuleKey = ruleKey;
        }

        /// <summary>An ad-hoc PCRM (designer Test button): no stored identity.</summary>
        public static ExecutableRuleVersion AdHoc(string pcrm) => new ExecutableRuleVersion(pcrm, null, null, null, null);

        public string Pcrm { get; }
        public Guid? RuleVersionId { get; }
        public Guid? RuleId { get; }
        public int? VersionNumber { get; }
        public string? RuleKey { get; }
    }
}
