using System.Collections.Generic;

namespace Msst.DebtCollection.Plugins.Domain
{
    /// <summary>
    /// Encodes the allowed statuscode transition matrices for
    /// <c>msst_dcpcollectioncase</c> (appendix §B.1) and
    /// <c>msst_dcpptprecord</c> (appendix §B.2) as code, per §4.6
    /// (transitions are code, not config).
    ///
    /// Option-set integer codes are 100000000-based (GOT-011).
    /// The named constants in <see cref="CaseStatus"/> and
    /// <see cref="PtpStatus"/> MUST be verified against the provisioned
    /// schema after deployment — see REGISTRATION.md §4.
    /// </summary>
    public static class StatusTransitionMatrix
    {
        // ── msst_dcpcollectioncase statuscode values (FR-022, 17 states) ────────
        /// <summary>Status code constants for <c>msst_dcpcollectioncase</c>.</summary>
        public static class CaseStatus
        {
            public const int New = 463270200;
            public const int Assigned = 463270201;
            public const int InProgress = 463270202;
            public const int PendingCustomerResponse = 463270203;
            public const int PtpActive = 463270204;
            public const int PtpBroken = 463270205;
            public const int RestructureReview = 463270206;
            public const int Restructured = 463270207;
            public const int EscalatedToSupervisor = 463270208;
            public const int PendingLegalReview = 463270209;
            public const int ReferredToLegal = 463270210;
            public const int UnderLegalAction = 463270211;
            public const int DeceasedInsuranceReview = 463270212;
            public const int Settled = 463270213;
            public const int Closed = 463270214;
            public const int WrittenOff = 463270215;
            public const int Reopened = 463270216;
        }

        // ── msst_dcpptprecord msst_status values (FR-059, 6 states) ─────────────
        /// <summary>Status constants for <c>msst_dcpptprecord.msst_status</c>.</summary>
        public static class PtpStatus
        {
            public const int Open = 463270220;
            public const int Kept = 463270221;
            public const int PartiallyKept = 463270222;
            public const int Broken = 463270223;
            public const int Rescheduled = 463270224;
            public const int Cancelled = 463270225;
        }

        // ── Allowed-transition maps ───────────────────────────────────────────────

        private static readonly Dictionary<int, HashSet<int>> CaseAllowed =
            new Dictionary<int, HashSet<int>>
            {
                [CaseStatus.New] = new HashSet<int> { CaseStatus.Assigned },
                [CaseStatus.Assigned] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.EscalatedToSupervisor },
                [CaseStatus.InProgress] = new HashSet<int> {
                    CaseStatus.PendingCustomerResponse, CaseStatus.PtpActive,
                    CaseStatus.RestructureReview, CaseStatus.PendingLegalReview,
                    CaseStatus.DeceasedInsuranceReview, CaseStatus.EscalatedToSupervisor },
                [CaseStatus.PendingCustomerResponse] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.PtpActive },
                [CaseStatus.PtpActive] = new HashSet<int> {
                    CaseStatus.PtpBroken, CaseStatus.InProgress, CaseStatus.Settled },
                [CaseStatus.PtpBroken] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.EscalatedToSupervisor,
                    CaseStatus.PendingLegalReview },
                [CaseStatus.RestructureReview] = new HashSet<int> {
                    CaseStatus.Restructured, CaseStatus.InProgress },
                [CaseStatus.Restructured] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.Settled },
                [CaseStatus.EscalatedToSupervisor] = new HashSet<int> {
                    CaseStatus.InProgress, CaseStatus.PendingLegalReview },
                [CaseStatus.PendingLegalReview] = new HashSet<int> {
                    CaseStatus.ReferredToLegal, CaseStatus.InProgress },
                [CaseStatus.ReferredToLegal] = new HashSet<int> {
                    CaseStatus.UnderLegalAction, CaseStatus.InProgress },
                [CaseStatus.UnderLegalAction] = new HashSet<int> {
                    CaseStatus.Settled, CaseStatus.WrittenOff },
                [CaseStatus.DeceasedInsuranceReview] = new HashSet<int> {
                    CaseStatus.Settled, CaseStatus.WrittenOff },
                [CaseStatus.Settled] = new HashSet<int> { CaseStatus.Closed },
                [CaseStatus.Closed] = new HashSet<int> { CaseStatus.Reopened },
                [CaseStatus.WrittenOff] = new HashSet<int> { CaseStatus.Reopened },
                [CaseStatus.Reopened] = new HashSet<int> { CaseStatus.InProgress },
            };

        private static readonly Dictionary<int, HashSet<int>> PtpAllowed =
            new Dictionary<int, HashSet<int>>
            {
                [PtpStatus.Open] = new HashSet<int> {
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
                [PtpStatus.Open] = "Open",
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