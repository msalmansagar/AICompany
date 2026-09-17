using System.Collections.Generic;

namespace Qdb.DebtCollection.Plugins.Domain
{
    /// <summary>
    /// Encodes the allowed transition matrices for <c>qdb_collectioncase.statuscode</c>
    /// (appendix §B.1) and the promise-to-pay status carried by
    /// <c>qdb_collectionactivity.qdb_ptpstatus</c> (appendix §B.2) as code, per §4.6
    /// (transitions are code, not config).
    ///
    /// The integers below are the values the QDB publisher assigned when the canonical
    /// schema was provisioned on 2026-09-17 (publisher <c>qdb</c>, OptionValuePrefix
    /// 10000). They are read back and re-verified by the provisioning script's
    /// verification step — see docs/phases and REGISTRATION.md §4.
    /// </summary>
    public static class StatusTransitionMatrix
    {
        // ── qdb_collectioncase statuscode values (FR-022, 17 states) ───────────
        /// <summary>Status code constants for <c>qdb_collectioncase</c>.</summary>
        public static class CaseStatus
        {
            public const int New = 100000600;
            public const int Assigned = 100000601;
            public const int InProgress = 100000602;
            public const int PendingCustomerResponse = 100000603;
            public const int PtpActive = 100000604;
            public const int PtpBroken = 100000605;
            public const int RestructureReview = 100000606;
            public const int Restructured = 100000607;
            public const int EscalatedToSupervisor = 100000608;
            public const int PendingLegalReview = 100000609;
            public const int ReferredToLegal = 100000610;
            public const int UnderLegalAction = 100000611;
            public const int DeceasedInsuranceReview = 100000612;
            public const int Settled = 100000613;
            public const int Closed = 100000614;
            public const int WrittenOff = 100000615;
            public const int Reopened = 100000616;
        }

        // ── qdb_collectionactivity statuscode values (6 states) ────────────────
        /// <summary>
        /// Lifecycle status codes for <c>qdb_collectionactivity</c>. Distinct from
        /// <see cref="PtpStatus"/>: an activity has a lifecycle whether or not it carries
        /// a promise to pay.
        /// </summary>
        public static class ActivityStatus
        {
            public const int Open = 100000640;
            public const int InProgress = 100000641;
            public const int AwaitingApproval = 100000642;
            public const int Returned = 100000643;
            public const int Completed = 100000644;
            public const int Cancelled = 100000645;
        }

        // ── qdb_collectionactivity.qdb_ptpstatus values (FR-059, 6 states) ─────
        /// <summary>
        /// Promise-to-pay status constants for <c>qdb_collectionactivity.qdb_ptpstatus</c>.
        /// PTP is an activity type in the canonical schema, not a separate entity, so the
        /// promise lifecycle lives on its own choice column rather than on statuscode.
        /// </summary>
        public static class PtpStatus
        {
            public const int Active = 100000080;
            public const int Kept = 100000081;
            public const int PartiallyKept = 100000082;
            public const int Broken = 100000083;
            public const int Rescheduled = 100000084;
            public const int Cancelled = 100000085;
        }

        // ── Allowed-transition maps ───────────────────────────────────────────────

        // ── Deceased/Insurance Review as a universal escape hatch ───────────────
        // DeceasedInsuranceReview is a permitted escape hatch from every non-terminal
        // state (App §B.1, Build-step-1 decision 3, 2026-09-16). The five states
        // that do NOT carry it are the terminal/already-there group:
        //   UnderLegalAction, DeceasedInsuranceReview itself, Settled, Closed, WrittenOff.

        private static readonly Dictionary<int, HashSet<int>> CaseAllowed =
            new Dictionary<int, HashSet<int>>
            {
                [CaseStatus.New] = new HashSet<int> {
                    CaseStatus.Assigned,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.Assigned] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.EscalatedToSupervisor,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.InProgress] = new HashSet<int> {
                    CaseStatus.PendingCustomerResponse, CaseStatus.PtpActive,
                    CaseStatus.RestructureReview, CaseStatus.PendingLegalReview,
                    CaseStatus.DeceasedInsuranceReview, CaseStatus.EscalatedToSupervisor },
                [CaseStatus.PendingCustomerResponse] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.PtpActive,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.PtpActive] = new HashSet<int> {
                    CaseStatus.PtpBroken, CaseStatus.InProgress, CaseStatus.Settled,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.PtpBroken] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.EscalatedToSupervisor,
                    CaseStatus.PendingLegalReview,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.RestructureReview] = new HashSet<int> {
                    CaseStatus.Restructured, CaseStatus.InProgress,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.Restructured] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.Settled,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.EscalatedToSupervisor] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.PendingLegalReview,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.PendingLegalReview] = new HashSet<int> {
                    CaseStatus.ReferredToLegal, CaseStatus.InProgress,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.ReferredToLegal] = new HashSet<int> {
                    CaseStatus.UnderLegalAction, CaseStatus.InProgress,
                    CaseStatus.DeceasedInsuranceReview },
                [CaseStatus.Reopened] = new HashSet<int> {
                    CaseStatus.InProgress,
                    CaseStatus.DeceasedInsuranceReview },

                // Terminal / already-there — DeceasedInsuranceReview NOT permitted as target.
                [CaseStatus.UnderLegalAction] = new HashSet<int> {
                    CaseStatus.Settled, CaseStatus.WrittenOff },
                [CaseStatus.DeceasedInsuranceReview] = new HashSet<int> {
                    CaseStatus.Settled, CaseStatus.WrittenOff },
                [CaseStatus.Settled] = new HashSet<int> { CaseStatus.Closed },
                [CaseStatus.Closed] = new HashSet<int> { CaseStatus.Reopened },
                [CaseStatus.WrittenOff] = new HashSet<int> { CaseStatus.Reopened },
            };

        private static readonly Dictionary<int, HashSet<int>> PtpAllowed =
            new Dictionary<int, HashSet<int>>
            {
                [PtpStatus.Active] = new HashSet<int> {
                    PtpStatus.Kept, PtpStatus.PartiallyKept, PtpStatus.Broken,
                    PtpStatus.Rescheduled, PtpStatus.Cancelled },
                [PtpStatus.Rescheduled] = new HashSet<int> {
                    PtpStatus.Kept, PtpStatus.PartiallyKept, PtpStatus.Broken,
                    PtpStatus.Rescheduled, PtpStatus.Cancelled },
                [PtpStatus.PartiallyKept] = new HashSet<int> {
                    PtpStatus.Broken, PtpStatus.Kept, PtpStatus.Cancelled },
                [PtpStatus.Broken] = new HashSet<int> {
                    PtpStatus.Kept, PtpStatus.Cancelled },
                [PtpStatus.Kept] = new HashSet<int>(),
                [PtpStatus.Cancelled] = new HashSet<int>(),
            };

        // ── Contact-bearing states ────────────────────────────────────────────────

        /// <summary>
        /// The authoritative set of contact-bearing case statuses.
        ///
        /// A status is contact-bearing when an active collection officer would
        /// be engaging with the customer in that state.  Any transition INTO a
        /// contact-bearing state is blocked by <c>StatusTransitionValidator</c>
        /// when <c>msst_stopcontact = true</c> on the customer (FR-043/097).
        ///
        /// Contact-bearing: New, Assigned, In Progress, Pending Customer Response,
        /// PTP Active, PTP Broken, Escalated to Supervisor, Reopened.
        ///
        /// Not contact-bearing (excluded): Restructure Review, Restructured,
        /// Pending Legal Review, Referred to Legal, Under Legal Action,
        /// Deceased/Insurance Review (the explicit FR-097 carve-out),
        /// Settled, Closed, Written Off.
        ///
        /// This is the single definition of the contact-bearing set — do not
        /// duplicate it elsewhere.
        /// </summary>
        public static readonly HashSet<int> ContactBearingStates = new HashSet<int>
        {
            CaseStatus.New,
            CaseStatus.Assigned,
            CaseStatus.InProgress,
            CaseStatus.PendingCustomerResponse,
            CaseStatus.PtpActive,
            CaseStatus.PtpBroken,
            CaseStatus.EscalatedToSupervisor,
            CaseStatus.Reopened,
        };

        // ── Display-name maps ─────────────────────────────────────────────────────

        private static readonly Dictionary<int, string> CaseStatusNames =
            new Dictionary<int, string>
            {
                [CaseStatus.New] = "New",
                [CaseStatus.Assigned] = "Assigned",
                [CaseStatus.InProgress] = "In Progress",
                [CaseStatus.PendingCustomerResponse] = "Pending Customer Response",
                [CaseStatus.PtpActive] = "PTP Active",
                [CaseStatus.PtpBroken] = "PTP Broken",
                [CaseStatus.RestructureReview] = "Restructure Review",
                [CaseStatus.Restructured] = "Restructured",
                [CaseStatus.EscalatedToSupervisor] = "Escalated to Supervisor",
                [CaseStatus.PendingLegalReview] = "Pending Legal Review",
                [CaseStatus.ReferredToLegal] = "Referred to Legal",
                [CaseStatus.UnderLegalAction] = "Under Legal Action",
                [CaseStatus.DeceasedInsuranceReview] = "Deceased/Insurance Review",
                [CaseStatus.Settled] = "Settled",
                [CaseStatus.Closed] = "Closed",
                [CaseStatus.WrittenOff] = "Written Off",
                [CaseStatus.Reopened] = "Reopened",
            };

        private static readonly Dictionary<int, string> PtpStatusNames =
            new Dictionary<int, string>
            {
                [PtpStatus.Active] = "Active",
                [PtpStatus.Kept] = "Kept",
                [PtpStatus.PartiallyKept] = "Partially Kept",
                [PtpStatus.Broken] = "Broken",
                [PtpStatus.Rescheduled] = "Rescheduled",
                [PtpStatus.Cancelled] = "Cancelled",
            };

        // ── Public query methods ──────────────────────────────────────────────────

        /// <summary>
        /// Returns <c>true</c> when transitioning a collection case from
        /// <paramref name="fromCode"/> to <paramref name="toCode"/> is permitted.
        /// </summary>
        public static bool IsCaseTransitionAllowed(int fromCode, int toCode) =>
            CaseAllowed.TryGetValue(fromCode, out var allowed) && allowed.Contains(toCode);

        /// <summary>
        /// Returns <c>true</c> when transitioning a PTP record from
        /// <paramref name="fromCode"/> to <paramref name="toCode"/> is permitted.
        /// </summary>
        public static bool IsPtpTransitionAllowed(int fromCode, int toCode) =>
            PtpAllowed.TryGetValue(fromCode, out var allowed) && allowed.Contains(toCode);

        /// <summary>
        /// Returns <c>true</c> when <paramref name="statusCode"/> is a
        /// contact-bearing case status — i.e., a state that involves active
        /// engagement with the customer.  A transition into such a state is
        /// blocked when the customer's <c>msst_stopcontact</c> flag is set
        /// (FR-043/097).  See <see cref="ContactBearingStates"/> for the full list.
        /// </summary>
        public static bool IsContactBearing(int statusCode) =>
            ContactBearingStates.Contains(statusCode);

        /// <summary>Returns the display name for a collection-case status code.</summary>
        public static string GetCaseStatusName(int code) =>
            CaseStatusNames.TryGetValue(code, out var name) ? name : code.ToString();

        /// <summary>Returns the display name for a PTP status code.</summary>
        public static string GetPtpStatusName(int code) =>
            PtpStatusNames.TryGetValue(code, out var name) ? name : code.ToString();
    }
}