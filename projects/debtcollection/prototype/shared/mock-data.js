/* =====================================================================
   Debt Collection Platform — demonstration dataset
   Stands in for the CRM Context Router. Every record carries the `org`
   that owns it, because in production no single query spans both CRMs.
   ===================================================================== */
"use strict";

const ORGS = {
  HL: { code: "HL", name: "Housing Loan CRM", url: "hlcrm.crm4.dynamics.com", products: ["Home Finance", "Land Finance", "Construction Finance"] },
  BFD: { code: "BFD", name: "BFD CRM", url: "bfdcrm.crm4.dynamics.com", products: ["SME Term Loan", "Working Capital", "Equipment Finance"] }
};

const ROLES = {
  officer: { id: "officer", name: "Collection Officer", short: "Officer", user: "Salman Sagar", initials: "SS" },
  rm: { id: "rm", name: "Relationship Manager", short: "RM", user: "Layla Al-Thani", initials: "LT" },
  manager: { id: "manager", name: "Senior Manager", short: "Manager", user: "Omar Al-Kaabi", initials: "OK" },
  legal: { id: "legal", name: "Legal Officer", short: "Legal", user: "Hind Al-Attiyah", initials: "HA" },
  workout: { id: "workout", name: "Restructuring Officer", short: "Workout", user: "Rashid Al-Malki", initials: "RM" }
};

/** DPD buckets drive strategy, colour and queue routing. One definition, read everywhere. */
const BUCKETS = [
  { id: "B0", label: "Current", from: 0, to: 0, cls: "b0", strategy: "Monitor only" },
  { id: "B1", label: "1–30 DPD", from: 1, to: 30, cls: "b1", strategy: "Soft reminder" },
  { id: "B2", label: "31–60 DPD", from: 31, to: 60, cls: "b2", strategy: "Active follow-up" },
  { id: "B3", label: "61–90 DPD", from: 61, to: 90, cls: "b3", strategy: "Field visit / PTP" },
  { id: "B4", label: "91–180 DPD", from: 91, to: 180, cls: "b4", strategy: "Pre-legal notice" },
  { id: "B5", label: "180+ DPD", from: 181, to: 9999, cls: "b4", strategy: "Legal hand-off" }
];

const QUEUES = [
  { id: "Q-EARLY", name: "Early Collection", org: "BOTH", owner: "Auto-assign", open: 42, sla: "24h", desc: "1–30 DPD, low exposure, first contact" },
  { id: "Q-HIGH", name: "High Risk / High Exposure", org: "BOTH", owner: "Omar Al-Kaabi", open: 18, sla: "8h", desc: "Exposure above QAR 2,000,000 or risk grade 7+" },
  { id: "Q-DECEASED", name: "Deceased & Insurance", org: "BOTH", owner: "Hind Al-Attiyah", open: 5, sla: "48h", desc: "Contact suppressed, claim lifecycle only" },
  { id: "Q-LEGAL", name: "Legal Review", org: "BOTH", owner: "Hind Al-Attiyah", open: 9, sla: "72h", desc: "Awaiting legal acceptance of hand-off" },
  { id: "Q-WORKOUT", name: "Restructuring", org: "BOTH", owner: "Rashid Al-Malki", open: 11, sla: "5d", desc: "Workout proposal drafted or under approval" },
  { id: "Q-DISPUTE", name: "Disputes & Complaints", org: "BOTH", owner: "Layla Al-Thani", open: 7, sla: "48h", desc: "Arrears disputed, collection paused" }
];

const CUSTOMERS = [
  { id: "C-1001", name: "Ahmed Al-Kuwari", nameAr: "أحمد الكواري", qid: "28401234567", segment: "Retail", risk: 5, orgs: ["HL"], phone: "+974 5512 8890", email: "a.kuwari@example.qa", employer: "Ministry of Municipality", income: 34000, since: "2019-03-11", stopContact: false, kyc: "Valid" },
  { id: "C-1002", name: "Fatima Al-Sulaiti", nameAr: "فاطمة السليطي", qid: "27905567123", segment: "Retail + SME", risk: 7, orgs: ["HL", "BFD"], phone: "+974 3344 1120", email: "f.sulaiti@example.qa", employer: "Sulaiti Trading W.L.L.", income: 78000, since: "2016-08-02", stopContact: false, kyc: "Valid" },
  { id: "C-1003", name: "Mohammed Al-Mannai", nameAr: "محمد المناعي", qid: "28607781234", segment: "SME", risk: 6, orgs: ["BFD"], phone: "+974 6677 2201", email: "m.mannai@example.qa", employer: "Mannai Logistics", income: 152000, since: "2020-01-19", stopContact: false, kyc: "Renewal due" },
  { id: "C-1004", name: "Noora Al-Emadi", nameAr: "نورة العمادي", qid: "29102234889", segment: "Retail", risk: 3, orgs: ["HL"], phone: "+974 5590 7734", email: "n.emadi@example.qa", employer: "Qatar University", income: 41000, since: "2021-06-30", stopContact: false, kyc: "Valid" },
  { id: "C-1005", name: "Khalid Al-Hajri", nameAr: "خالد الهاجري", qid: "27011145002", segment: "SME", risk: 9, orgs: ["BFD"], phone: "+974 5501 3388", email: "k.hajri@example.qa", employer: "Hajri Contracting", income: 0, since: "2014-11-05", stopContact: true, kyc: "Deceased — verified" },
  { id: "C-1006", name: "Sara Al-Naimi", nameAr: "سارة النعيمي", qid: "29308890145", segment: "Retail", risk: 4, orgs: ["HL"], phone: "+974 3311 4456", email: "s.naimi@example.qa", employer: "Hamad Medical Corp", income: 39500, since: "2022-02-14", stopContact: false, kyc: "Valid" },
  { id: "C-1007", name: "Yousef Al-Dosari", nameAr: "يوسف الدوسري", qid: "28202267339", segment: "SME", risk: 9, orgs: ["BFD"], phone: "+974 7788 9012", email: "y.dosari@example.qa", employer: "Dosari Steel Works", income: 0, since: "2015-04-22", stopContact: false, kyc: "Expired" },
  { id: "C-1008", name: "Hessa Al-Marri", nameAr: "حصة المري", qid: "29506612780", segment: "Retail", risk: 6, orgs: ["HL"], phone: "+974 5566 3378", email: "h.marri@example.qa", employer: "Qatar Airways", income: 28000, since: "2018-09-08", stopContact: false, kyc: "Valid" }
];

const FACILITIES = [
  { id: "F-HL-8801", customerId: "C-1001", org: "HL", product: "Home Finance", outstanding: 1240000, instalment: 8600, overdue: 17200, dpd: 24, rate: 4.25, tenor: 240, collateral: "Villa — Al Wakrah, Deed 44821", guarantor: "—", insurance: "Takaful Life — active" },
  { id: "F-HL-8802", customerId: "C-1002", org: "HL", product: "Home Finance", outstanding: 2180000, instalment: 15400, overdue: 61600, dpd: 74, rate: 4.10, tenor: 300, collateral: "Villa — Al Rayyan, Deed 51203", guarantor: "Sulaiti Trading W.L.L.", insurance: "Takaful Life — active" },
  { id: "F-BFD-4410", customerId: "C-1002", org: "BFD", product: "Working Capital", outstanding: 950000, instalment: 42000, overdue: 84000, dpd: 68, rate: 6.75, tenor: 36, collateral: "Receivables assignment", guarantor: "Fatima Al-Sulaiti (personal)", insurance: "—" },
  { id: "F-BFD-4411", customerId: "C-1003", org: "BFD", product: "SME Term Loan", outstanding: 3400000, instalment: 96000, overdue: 96000, dpd: 21, rate: 6.20, tenor: 60, collateral: "Fleet — 14 vehicles", guarantor: "M. Al-Mannai (personal)", insurance: "Asset cover — active" },
  { id: "F-HL-8803", customerId: "C-1004", org: "HL", product: "Land Finance", outstanding: 640000, instalment: 5200, overdue: 5200, dpd: 9, rate: 4.50, tenor: 180, collateral: "Plot — Lusail, Deed 60112", guarantor: "—", insurance: "Takaful Life — active" },
  { id: "F-BFD-4412", customerId: "C-1005", org: "BFD", product: "Equipment Finance", outstanding: 1780000, instalment: 58000, overdue: 232000, dpd: 168, rate: 7.00, tenor: 48, collateral: "Excavators ×3", guarantor: "Estate of K. Al-Hajri", insurance: "Credit Life — claim lodged" },
  { id: "F-HL-8804", customerId: "C-1006", org: "HL", product: "Home Finance", outstanding: 880000, instalment: 6900, overdue: 13800, dpd: 38, rate: 4.35, tenor: 240, collateral: "Apartment — West Bay, Deed 33940", guarantor: "—", insurance: "Takaful Life — active" },
  { id: "F-BFD-4413", customerId: "C-1007", org: "BFD", product: "SME Term Loan", outstanding: 5100000, instalment: 141000, overdue: 846000, dpd: 214, rate: 6.90, tenor: 60, collateral: "Industrial plot + plant", guarantor: "Y. Al-Dosari (personal)", insurance: "—" },
  { id: "F-HL-8805", customerId: "C-1008", org: "HL", product: "Home Finance", outstanding: 1010000, instalment: 7400, overdue: 44400, dpd: 96, rate: 4.40, tenor: 264, collateral: "Villa — Umm Salal, Deed 47712", guarantor: "—", insurance: "Takaful Life — lapsed" }
];

const CASES = [
  { id: "HL-CC-20441", org: "HL", customerId: "C-1001", facilityId: "F-HL-8801", opened: "2026-07-09", dpd: 24, bucket: "B1", overdue: 17200, status: "In Follow-up", stage: "Contact", owner: "Salman Sagar", queue: "Q-EARLY", slaHours: 14, priority: "Normal", lastAction: "2026-07-28", nextAction: "2026-07-31" },
  { id: "HL-CC-20452", org: "HL", customerId: "C-1002", facilityId: "F-HL-8802", opened: "2026-05-21", dpd: 74, bucket: "B3", overdue: 61600, status: "PTP Captured", stage: "Promise", owner: "Salman Sagar", queue: "Q-HIGH", slaHours: 5, priority: "High", lastAction: "2026-07-29", nextAction: "2026-08-04" },
  { id: "BFD-CC-70118", org: "BFD", customerId: "C-1002", facilityId: "F-BFD-4410", opened: "2026-05-28", dpd: 68, bucket: "B3", overdue: 84000, status: "In Follow-up", stage: "Contact", owner: "Layla Al-Thani", queue: "Q-HIGH", slaHours: -3, priority: "High", lastAction: "2026-07-24", nextAction: "2026-07-30" },
  { id: "BFD-CC-70124", org: "BFD", customerId: "C-1003", facilityId: "F-BFD-4411", opened: "2026-07-12", dpd: 21, bucket: "B1", overdue: 96000, status: "New", stage: "Identify", owner: "Unassigned", queue: "Q-EARLY", slaHours: 22, priority: "Normal", lastAction: "—", nextAction: "2026-07-31" },
  { id: "HL-CC-20460", org: "HL", customerId: "C-1004", facilityId: "F-HL-8803", opened: "2026-07-24", dpd: 9, bucket: "B1", overdue: 5200, status: "New", stage: "Identify", owner: "Salman Sagar", queue: "Q-EARLY", slaHours: 19, priority: "Low", lastAction: "—", nextAction: "2026-07-30" },
  { id: "BFD-CC-70090", org: "BFD", customerId: "C-1005", facilityId: "F-BFD-4412", opened: "2026-02-14", dpd: 168, bucket: "B4", overdue: 232000, status: "Contact Suppressed", stage: "Escalate", owner: "Hind Al-Attiyah", queue: "Q-DECEASED", slaHours: 30, priority: "High", lastAction: "2026-07-20", nextAction: "2026-08-02" },
  { id: "HL-CC-20399", org: "HL", customerId: "C-1006", facilityId: "F-HL-8804", opened: "2026-06-18", dpd: 38, bucket: "B2", overdue: 13800, status: "Disputed", stage: "Contact", owner: "Layla Al-Thani", queue: "Q-DISPUTE", slaHours: 9, priority: "Normal", lastAction: "2026-07-26", nextAction: "2026-07-31" },
  { id: "BFD-CC-70055", org: "BFD", customerId: "C-1007", facilityId: "F-BFD-4413", opened: "2025-12-30", dpd: 214, bucket: "B5", overdue: 846000, status: "Legal Hand-off", stage: "Escalate", owner: "Hind Al-Attiyah", queue: "Q-LEGAL", slaHours: -26, priority: "Critical", lastAction: "2026-07-22", nextAction: "2026-07-30" },
  { id: "HL-CC-20410", org: "HL", customerId: "C-1008", facilityId: "F-HL-8805", opened: "2026-04-26", dpd: 96, bucket: "B4", overdue: 44400, status: "Restructure Proposed", stage: "Promise", owner: "Rashid Al-Malki", queue: "Q-WORKOUT", slaHours: 41, priority: "High", lastAction: "2026-07-27", nextAction: "2026-08-05" },
  { id: "HL-CC-20301", org: "HL", customerId: "C-1001", facilityId: "F-HL-8801", opened: "2026-01-15", dpd: 0, bucket: "B0", overdue: 0, status: "Closed — Paid", stage: "Closed", owner: "Salman Sagar", queue: "Q-EARLY", slaHours: 0, priority: "Low", lastAction: "2026-03-02", nextAction: "—" }
];

const ACTIONS = [
  { id: "A-9001", caseId: "HL-CC-20441", type: "Call", outcome: "Reached — promise given", by: "Salman Sagar", when: "2026-07-28 10:12", note: "Customer confirms salary delay at employer. Offered to settle 2 instalments by 4 Aug.", channel: "Outbound call" },
  { id: "A-9002", caseId: "HL-CC-20441", type: "SMS", outcome: "Delivered", by: "System", when: "2026-07-22 09:00", note: "Reminder template REM-01 sent in Arabic.", channel: "SMS" },
  { id: "A-9003", caseId: "HL-CC-20452", type: "Call", outcome: "Reached — PTP captured", by: "Salman Sagar", when: "2026-07-29 14:40", note: "PTP QAR 30,800 on 4 Aug. Customer requests split over two dates — recorded as partial.", channel: "Outbound call" },
  { id: "A-9004", caseId: "HL-CC-20452", type: "Field Visit", outcome: "Not available", by: "Salman Sagar", when: "2026-07-15 11:20", note: "Address visited, occupant absent. Neighbour confirms residency.", channel: "Field" },
  { id: "A-9005", caseId: "BFD-CC-70118", type: "Email", outcome: "Opened, no reply", by: "Layla Al-Thani", when: "2026-07-24 08:35", note: "Working-capital arrears statement issued to the company address.", channel: "Email" },
  { id: "A-9006", caseId: "HL-CC-20399", type: "Call", outcome: "Reached — dispute raised", by: "Layla Al-Thani", when: "2026-07-26 12:05", note: "Customer states two instalments were deducted twice in May. Collection paused pending review.", channel: "Inbound call" },
  { id: "A-9007", caseId: "BFD-CC-70055", type: "Letter", outcome: "Delivered — signed", by: "Hind Al-Attiyah", when: "2026-07-22 16:00", note: "Final demand notice served. 14-day period expires 5 Aug.", channel: "Registered letter" },
  { id: "A-9008", caseId: "HL-CC-20410", type: "Meeting", outcome: "Restructure requested", by: "Rashid Al-Malki", when: "2026-07-27 09:50", note: "Customer income reduced 32%. Workout proposal WO-3007 drafted for approval.", channel: "Branch meeting" },
  { id: "A-9009", caseId: "BFD-CC-70090", type: "System", outcome: "Contact suppressed", by: "System", when: "2026-07-20 07:00", note: "Death certificate verified. All outbound channels blocked at the router.", channel: "—" }
];

const PTPS = [
  { id: "PTP-5001", caseId: "HL-CC-20452", org: "HL", customerId: "C-1002", amount: 30800, promised: "2026-08-04", type: "Partial", status: "Open", capturedBy: "Salman Sagar", capturedOn: "2026-07-29", reminder: "2026-08-02", kept: null, note: "Split settlement agreed verbally." },
  { id: "PTP-5002", caseId: "HL-CC-20441", org: "HL", customerId: "C-1001", amount: 17200, promised: "2026-08-04", type: "Full", status: "Open", capturedBy: "Salman Sagar", capturedOn: "2026-07-28", reminder: "2026-08-02", kept: null, note: "Salary expected 2 Aug." },
  { id: "PTP-5003", caseId: "BFD-CC-70118", org: "BFD", customerId: "C-1002", amount: 42000, promised: "2026-07-18", type: "Partial", status: "Broken", capturedBy: "Layla Al-Thani", capturedOn: "2026-07-08", reminder: "2026-07-16", kept: false, note: "No payment received. Second PTP refused by policy." },
  { id: "PTP-5004", caseId: "HL-CC-20399", org: "HL", customerId: "C-1006", amount: 6900, promised: "2026-07-10", type: "Partial", status: "Kept", capturedBy: "Layla Al-Thani", capturedOn: "2026-07-02", reminder: "2026-07-08", kept: true, note: "Paid in full on the promised date." },
  { id: "PTP-5005", caseId: "HL-CC-20410", org: "HL", customerId: "C-1008", amount: 14800, promised: "2026-07-25", type: "Partial", status: "Broken", capturedBy: "Rashid Al-Malki", capturedOn: "2026-07-14", reminder: "2026-07-23", kept: false, note: "Triggered restructuring assessment." },
  { id: "PTP-5006", caseId: "BFD-CC-70124", org: "BFD", customerId: "C-1003", amount: 96000, promised: "2026-08-08", type: "Full", status: "Open", capturedBy: "Layla Al-Thani", capturedOn: "2026-07-29", reminder: "2026-08-06", kept: null, note: "Awaiting receivable collection from main contractor." },
  { id: "PTP-5007", caseId: "HL-CC-20301", org: "HL", customerId: "C-1001", amount: 8600, promised: "2026-02-28", type: "Full", status: "Kept", capturedBy: "Salman Sagar", capturedOn: "2026-02-19", reminder: "2026-02-26", kept: true, note: "Case subsequently closed as paid." }
];

const TEMPLATES = [
  { id: "REM-01", name: "First reminder — SMS", channel: "SMS", lang: "EN / AR", bucket: "B1", approved: true, owner: "Collections Policy", body: "Dear {{customer}}, an amount of {{amount}} on facility {{facility}} is overdue. Please settle by {{date}}." },
  { id: "REM-02", name: "Second reminder — SMS", channel: "SMS", lang: "EN / AR", bucket: "B2", approved: true, owner: "Collections Policy", body: "Dear {{customer}}, your account remains {{dpd}} days overdue. Contact us on 800-0000 to avoid escalation." },
  { id: "STMT-01", name: "Arrears statement — Email", channel: "Email", lang: "EN", bucket: "B2", approved: true, owner: "Collections Policy", body: "Please find attached the arrears statement for facility {{facility}} as at {{date}}." },
  { id: "PTP-CONF", name: "PTP confirmation — SMS", channel: "SMS", lang: "EN / AR", bucket: "Any", approved: true, owner: "Collections Policy", body: "We have recorded your promise to pay {{amount}} on {{date}}. Thank you." },
  { id: "PTP-REM", name: "PTP reminder — SMS", channel: "SMS", lang: "EN / AR", bucket: "Any", approved: true, owner: "Collections Policy", body: "Reminder: your promised payment of {{amount}} is due on {{date}}." },
  { id: "PRELEG-01", name: "Pre-legal notice — Letter", channel: "Letter", lang: "EN / AR", bucket: "B4", approved: true, owner: "Legal", body: "Formal notice of arrears of {{amount}}. Settle within 14 days to avoid legal proceedings." },
  { id: "LEG-01", name: "Final demand — Letter", channel: "Letter", lang: "EN / AR", bucket: "B5", approved: true, owner: "Legal", body: "Final demand before referral to legal proceedings under facility {{facility}}." },
  { id: "COND-01", name: "Condolence & claim guidance", channel: "Letter", lang: "EN / AR", bucket: "Any", approved: false, owner: "Legal", body: "Draft — pending approval. Guidance to the estate on the insurance claim process." }
];

const COMMS = [
  { id: "CM-701", caseId: "HL-CC-20441", org: "HL", channel: "SMS", template: "REM-01", to: "+974 5512 8890", when: "2026-07-22 09:00", status: "Delivered", by: "System", lang: "AR" },
  { id: "CM-702", caseId: "HL-CC-20441", org: "HL", channel: "Call", template: "—", to: "+974 5512 8890", when: "2026-07-28 10:12", status: "Reached", by: "Salman Sagar", lang: "AR" },
  { id: "CM-703", caseId: "HL-CC-20452", org: "HL", channel: "SMS", template: "PTP-CONF", to: "+974 3344 1120", when: "2026-07-29 14:45", status: "Delivered", by: "System", lang: "EN" },
  { id: "CM-704", caseId: "BFD-CC-70118", org: "BFD", channel: "Email", template: "STMT-01", to: "f.sulaiti@example.qa", when: "2026-07-24 08:35", status: "Opened", by: "Layla Al-Thani", lang: "EN" },
  { id: "CM-705", caseId: "HL-CC-20399", org: "HL", channel: "Call", template: "—", to: "+974 3311 4456", when: "2026-07-26 12:05", status: "Reached", by: "Layla Al-Thani", lang: "EN" },
  { id: "CM-706", caseId: "BFD-CC-70055", org: "BFD", channel: "Letter", template: "LEG-01", to: "Industrial Area, St 42, Doha", when: "2026-07-22 16:00", status: "Signed", by: "Hind Al-Attiyah", lang: "AR" },
  { id: "CM-707", caseId: "HL-CC-20410", org: "HL", channel: "SMS", template: "REM-02", to: "+974 5566 3378", when: "2026-07-19 09:00", status: "Delivered", by: "System", lang: "AR" },
  { id: "CM-708", caseId: "BFD-CC-70090", org: "BFD", channel: "SMS", template: "REM-02", to: "+974 5501 3388", when: "2026-07-20 09:00", status: "Blocked — stop contact", by: "Router", lang: "AR" }
];

const DISPUTES = [
  { id: "DSP-301", caseId: "HL-CC-20399", org: "HL", customerId: "C-1006", type: "Double deduction", raised: "2026-07-26", status: "Under Review", amount: 13800, owner: "Layla Al-Thani", sla: "2026-07-31", collectionPaused: true, detail: "Two instalments claimed as deducted twice in May 2026. Core Banking statement requested." },
  { id: "DSP-302", caseId: "BFD-CC-70118", org: "BFD", customerId: "C-1002", type: "Arrears calculation", raised: "2026-07-12", status: "Rejected", amount: 84000, owner: "Layla Al-Thani", sla: "2026-07-19", collectionPaused: false, detail: "Customer disputed profit calculation. Recalculation confirmed the original figure." },
  { id: "DSP-303", caseId: "HL-CC-20441", org: "HL", customerId: "C-1001", type: "Account status", raised: "2026-06-02", status: "Resolved", amount: 8600, owner: "Salman Sagar", sla: "2026-06-09", collectionPaused: false, detail: "Status corrected after a delayed payment posting from Core Banking." },
  { id: "DSP-304", caseId: "BFD-CC-70124", org: "BFD", customerId: "C-1003", type: "Fee dispute", raised: "2026-07-28", status: "New", amount: 4500, owner: "Unassigned", sla: "2026-07-31", collectionPaused: true, detail: "Late-payment fee applied during an agreed grace window." },
  { id: "DSP-305", caseId: "HL-CC-20410", org: "HL", customerId: "C-1008", type: "Insurance cover", raised: "2026-07-05", status: "Resolved", amount: 0, owner: "Rashid Al-Malki", sla: "2026-07-12", collectionPaused: false, detail: "Takaful cover confirmed lapsed. Customer informed and offered reinstatement." }
];

const RESTRUCTURES = [
  { id: "WO-3007", caseId: "HL-CC-20410", org: "HL", customerId: "C-1008", status: "Pending Approval", raised: "2026-07-27", by: "Rashid Al-Malki", curTenor: 264, newTenor: 312, curInstal: 7400, newInstal: 5900, grace: 3, waiver: 8200, reason: "Income reduced 32% after employer restructuring", docs: ["Salary certificate", "Bank statement 6m", "Hardship declaration"], approver: "Omar Al-Kaabi" },
  { id: "WO-3008", caseId: "BFD-CC-70118", org: "BFD", customerId: "C-1002", status: "Draft", raised: "2026-07-29", by: "Rashid Al-Malki", curTenor: 36, newTenor: 48, curInstal: 42000, newInstal: 33500, grace: 2, waiver: 0, reason: "Receivable cycle extended by main contractor", docs: ["Aged receivables report"], approver: "—" },
  { id: "WO-3005", caseId: "BFD-CC-70124", org: "BFD", customerId: "C-1003", status: "Approved", raised: "2026-06-11", by: "Rashid Al-Malki", curTenor: 60, newTenor: 72, curInstal: 96000, newInstal: 82000, grace: 0, waiver: 12000, reason: "Fleet expansion delayed, seasonal revenue dip", docs: ["Audited accounts 2025", "Cash-flow forecast"], approver: "Omar Al-Kaabi" },
  { id: "WO-2998", caseId: "HL-CC-20452", org: "HL", customerId: "C-1002", status: "Rejected", raised: "2026-05-30", by: "Rashid Al-Malki", curTenor: 300, newTenor: 360, curInstal: 15400, newInstal: 12900, grace: 6, waiver: 21000, reason: "Requested tenor beyond policy maximum", docs: ["Hardship declaration"], approver: "Omar Al-Kaabi" }
];

const LEGAL_CASES = [
  { id: "LG-1201", caseId: "BFD-CC-70055", org: "BFD", customerId: "C-1007", status: "Accepted", handedOn: "2026-07-22", acceptedOn: "2026-07-24", lawyer: "Hind Al-Attiyah", court: "Doha Court of First Instance", action: "Debt recovery claim", exposure: 5100000, crmLink: "bfdcrm.crm4.dynamics.com/main.aspx?etn=qdb_legalcase&id=LG-1201", nextHearing: "2026-09-14" },
  { id: "LG-1202", caseId: "HL-CC-20410", org: "HL", customerId: "C-1008", status: "Pending Acceptance", handedOn: "2026-07-28", acceptedOn: "—", lawyer: "Unassigned", court: "—", action: "Pre-legal notice served", exposure: 1010000, crmLink: "hlcrm.crm4.dynamics.com/main.aspx?etn=qdb_legalcase&id=LG-1202", nextHearing: "—" },
  { id: "LG-1198", caseId: "BFD-CC-70090", org: "BFD", customerId: "C-1005", status: "Rejected", handedOn: "2026-07-02", acceptedOn: "—", lawyer: "Hind Al-Attiyah", court: "—", action: "Returned — estate settlement route", exposure: 1780000, crmLink: "bfdcrm.crm4.dynamics.com/main.aspx?etn=qdb_legalcase&id=LG-1198", nextHearing: "—" }
];

const CLAIMS = [
  { id: "CLM-401", caseId: "BFD-CC-70090", org: "BFD", customerId: "C-1005", kind: "Deceased — Credit Life", notified: "2026-07-18", verified: "2026-07-20", insurer: "Qatar Takaful", status: "Documents Pending", amount: 1780000, stopContact: true, docs: [{ name: "Death certificate", got: true }, { name: "Heirs list (court)", got: true }, { name: "Insurance claim form", got: false }, { name: "Outstanding statement", got: true }, { name: "Estate authorisation", got: false }] },
  { id: "CLM-402", caseId: "HL-CC-20410", org: "HL", customerId: "C-1008", kind: "Disability — Takaful Life", notified: "2026-07-05", verified: "—", insurer: "Qatar Takaful", status: "Rejected — cover lapsed", amount: 0, stopContact: false, docs: [{ name: "Medical report", got: true }, { name: "Policy schedule", got: true }, { name: "Premium history", got: true }] },
  { id: "CLM-403", caseId: "HL-CC-20452", org: "HL", customerId: "C-1002", kind: "Deceased — Co-borrower", notified: "2026-06-28", verified: "2026-07-01", insurer: "Doha Insurance", status: "Paid", amount: 420000, stopContact: false, docs: [{ name: "Death certificate", got: true }, { name: "Claim form", got: true }, { name: "Settlement advice", got: true }] }
];

const STRATEGY_RULES = [
  { id: "SR-01", bucket: "B1", segment: "Retail", riskFrom: 1, riskTo: 5, exposure: "< 1,000,000", action: "SMS reminder REM-01 on day 3, call on day 10", channel: "SMS → Call", queue: "Q-EARLY", active: true, priority: 10 },
  { id: "SR-02", bucket: "B1", segment: "SME", riskFrom: 1, riskTo: 6, exposure: "Any", action: "Email statement STMT-01, RM call on day 7", channel: "Email → Call", queue: "Q-EARLY", active: true, priority: 20 },
  { id: "SR-03", bucket: "B2", segment: "Any", riskFrom: 1, riskTo: 6, exposure: "Any", action: "Reminder REM-02, mandatory call, PTP target", channel: "SMS → Call", queue: "Q-EARLY", active: true, priority: 30 },
  { id: "SR-04", bucket: "B2", segment: "Any", riskFrom: 7, riskTo: 10, exposure: "> 2,000,000", action: "Escalate to high-risk queue, senior review", channel: "Call", queue: "Q-HIGH", active: true, priority: 35 },
  { id: "SR-05", bucket: "B3", segment: "Retail", riskFrom: 1, riskTo: 10, exposure: "Any", action: "Field visit, PTP mandatory, restructure eligibility check", channel: "Field → Call", queue: "Q-HIGH", active: true, priority: 40 },
  { id: "SR-06", bucket: "B4", segment: "Any", riskFrom: 1, riskTo: 10, exposure: "Any", action: "Pre-legal notice PRELEG-01, workout referral", channel: "Letter", queue: "Q-WORKOUT", active: true, priority: 50 },
  { id: "SR-07", bucket: "B5", segment: "Any", riskFrom: 1, riskTo: 10, exposure: "Any", action: "Final demand LEG-01 then legal hand-off", channel: "Letter", queue: "Q-LEGAL", active: true, priority: 60 },
  /* Gated on a customer flag rather than on bucket or segment. It sits at priority 1 so that when the
     flag is set it outranks every collection strategy, but it must not win an ordinary bucket lookup. */
  { id: "SR-08", bucket: "Any", segment: "Any", riskFrom: 1, riskTo: 10, exposure: "Any", action: "Suppress all contact, route to claims", channel: "None", queue: "Q-DECEASED", active: true, priority: 1, requiresFlag: "stopContact" }
];

const APPROVALS = [
  { id: "AP-801", type: "Restructure", ref: "WO-3007", org: "HL", requestedBy: "Rashid Al-Malki", requestedOn: "2026-07-27", approver: "Omar Al-Kaabi", status: "Pending", amount: 8200, summary: "Tenor 264→312m, instalment 7,400→5,900, waiver 8,200, grace 3m" },
  { id: "AP-802", type: "Waiver", ref: "HL-CC-20452", org: "HL", requestedBy: "Salman Sagar", requestedOn: "2026-07-29", approver: "Omar Al-Kaabi", status: "Pending", amount: 3400, summary: "Late-payment fee waiver requested as a PTP incentive" },
  { id: "AP-803", type: "Legal Hand-off", ref: "LG-1202", org: "HL", requestedBy: "Rashid Al-Malki", requestedOn: "2026-07-28", approver: "Omar Al-Kaabi", status: "Pending", amount: 1010000, summary: "Refer HL-CC-20410 to the CRM Legal module" },
  { id: "AP-804", type: "Strategy Exception", ref: "BFD-CC-70124", org: "BFD", requestedBy: "Layla Al-Thani", requestedOn: "2026-07-29", approver: "Omar Al-Kaabi", status: "Pending", amount: 0, summary: "Hold collection 14 days pending contractor receivable" },
  { id: "AP-798", type: "Restructure", ref: "WO-3005", org: "BFD", requestedBy: "Rashid Al-Malki", requestedOn: "2026-06-11", approver: "Omar Al-Kaabi", status: "Approved", amount: 12000, summary: "Tenor 60→72m, waiver 12,000" },
  { id: "AP-795", type: "Restructure", ref: "WO-2998", org: "HL", requestedBy: "Rashid Al-Malki", requestedOn: "2026-05-30", approver: "Omar Al-Kaabi", status: "Rejected", amount: 21000, summary: "Requested tenor exceeds the 336-month policy maximum" }
];

const AUDIT = [
  { id: "AU-9910", when: "2026-07-29 14:45", who: "Salman Sagar", role: "Collection Officer", org: "HL", entity: "PTP", ref: "PTP-5001", action: "Create", field: "—", from: "—", to: "Open · QAR 30,800 · 2026-08-04", source: "React → Router → HL CRM" },
  { id: "AU-9909", when: "2026-07-29 14:40", who: "Salman Sagar", role: "Collection Officer", org: "HL", entity: "Case", ref: "HL-CC-20452", action: "Status change", field: "statuscode", from: "In Follow-up", to: "PTP Captured", source: "React → Router → HL CRM" },
  { id: "AU-9908", when: "2026-07-29 11:02", who: "Layla Al-Thani", role: "Relationship Manager", org: "BFD", entity: "Approval", ref: "AP-804", action: "Submit", field: "—", from: "—", to: "Pending", source: "React → Router → BFD CRM" },
  { id: "AU-9907", when: "2026-07-28 16:20", who: "Rashid Al-Malki", role: "Restructuring Officer", org: "HL", entity: "Legal", ref: "LG-1202", action: "Hand-off", field: "status", from: "—", to: "Pending Acceptance", source: "React → Router → HL CRM Legal" },
  { id: "AU-9906", when: "2026-07-28 10:14", who: "Salman Sagar", role: "Collection Officer", org: "HL", entity: "Action", ref: "A-9001", action: "Create", field: "—", from: "—", to: "Call · Reached — promise given", source: "React → Router → HL CRM" },
  { id: "AU-9905", when: "2026-07-27 09:55", who: "Rashid Al-Malki", role: "Restructuring Officer", org: "HL", entity: "Restructure", ref: "WO-3007", action: "Create", field: "—", from: "—", to: "Pending Approval", source: "React → Router → HL CRM" },
  { id: "AU-9904", when: "2026-07-26 12:06", who: "Layla Al-Thani", role: "Relationship Manager", org: "HL", entity: "Case", ref: "HL-CC-20399", action: "Status change", field: "statuscode", from: "In Follow-up", to: "Disputed", source: "React → Router → HL CRM" },
  { id: "AU-9903", when: "2026-07-24 09:31", who: "Omar Al-Kaabi", role: "Senior Manager", org: "BFD", entity: "Case", ref: "BFD-CC-70118", action: "Reassign", field: "ownerid", from: "Salman Sagar", to: "Layla Al-Thani", source: "React → Router → BFD CRM" },
  { id: "AU-9902", when: "2026-07-20 07:00", who: "System", role: "Router", org: "BFD", entity: "Communication", ref: "CM-708", action: "Blocked", field: "channel", from: "SMS", to: "Suppressed — deceased", source: "CRM Context Router" },
  { id: "AU-9901", when: "2026-07-20 06:58", who: "Hind Al-Attiyah", role: "Legal Officer", org: "BFD", entity: "Customer", ref: "C-1005", action: "Set flag", field: "stopContact", from: "false", to: "true", source: "React → Router → BFD CRM" },
  { id: "AU-9900", when: "2026-07-18 13:44", who: "Omar Al-Kaabi", role: "Senior Manager", org: "HL", entity: "Strategy Rule", ref: "SR-04", action: "Update", field: "exposure", from: "> 1,500,000", to: "> 2,000,000", source: "Admin → Router → both CRMs" }
];

const INTEGRATIONS = [
  { id: "INT-CBS", name: "Core Banking", kind: "Inbound", mode: "Nightly batch + on-demand", last: "2026-07-30 02:14", status: "Healthy", latency: "—", records: "18,442 balances", note: "Source of arrears, balances and payment postings" },
  { id: "INT-HL", name: "Housing Loan CRM", kind: "Bi-directional", mode: "Web API (live)", last: "2026-07-30 08:41", status: "Healthy", latency: "310 ms", records: "—", note: "System of record for Housing Loan cases" },
  { id: "INT-BFD", name: "BFD CRM", kind: "Bi-directional", mode: "Web API (live)", last: "2026-07-30 08:41", status: "Degraded", latency: "1,940 ms", records: "—", note: "Elevated latency since 07:20 — throttling suspected" },
  { id: "INT-PAY", name: "Payments", kind: "Inbound", mode: "Event stream", last: "2026-07-30 08:39", status: "Healthy", latency: "120 ms", records: "312 today", note: "Settles PTPs automatically on matched payment" },
  { id: "INT-MSG", name: "SMS / Email Gateway", kind: "Outbound", mode: "REST", last: "2026-07-30 08:30", status: "Healthy", latency: "480 ms", records: "1,204 today", note: "All sends pass the suppression check first" },
  { id: "INT-QCB", name: "QCB / Credit Bureau", kind: "Outbound", mode: "Scheduled file", last: "2026-07-29 23:50", status: "Healthy", latency: "—", records: "9,880 accounts", note: "Monthly delinquency reporting" },
  { id: "INT-DWH", name: "DWH / BI", kind: "Outbound", mode: "Nightly extract", last: "2026-07-30 03:05", status: "Healthy", latency: "—", records: "All modules", note: "Serves every portfolio-level dashboard" }
];

/** How the router decides which CRM owns a request. Evaluated top-down, first match wins. */
const ROUTER_RULES = [
  { seq: 1, when: "Record id prefix is HL-", target: "HL", kind: "Deterministic", note: "Case, PTP and action ids carry their org" },
  { seq: 2, when: "Record id prefix is BFD-", target: "BFD", kind: "Deterministic", note: "Case, PTP and action ids carry their org" },
  { seq: 3, when: "Product ∈ Home / Land / Construction Finance", target: "HL", kind: "Product", note: "Facility-level routing for new cases" },
  { seq: 4, when: "Product ∈ SME Term / Working Capital / Equipment", target: "BFD", kind: "Product", note: "Facility-level routing for new cases" },
  { seq: 5, when: "Customer 360 read by QID", target: "BOTH", kind: "Fan-out + merge", note: "Identity map resolves QID to both org GUIDs" },
  { seq: 6, when: "Portfolio dashboard read", target: "DWH", kind: "Warehouse", note: "Neither CRM can answer a cross-org aggregate" },
  { seq: 7, when: "Outbound communication", target: "Suppression check first", kind: "Guard", note: "Stop-contact enforced before any channel adapter" }
];

/** Warehouse series. Portfolio numbers span both orgs and cannot come from either CRM. */
const MIS = {
  bucketBalance: [
    { bucket: "1–30 DPD", cls: "b1", hl: 18400000, bfd: 11200000, accounts: 412 },
    { bucket: "31–60 DPD", cls: "b2", hl: 9600000, bfd: 7400000, accounts: 188 },
    { bucket: "61–90 DPD", cls: "b3", hl: 6100000, bfd: 5900000, accounts: 96 },
    { bucket: "91–180 DPD", cls: "b4", hl: 4300000, bfd: 8800000, accounts: 61 },
    { bucket: "180+ DPD", cls: "b4", hl: 2900000, bfd: 12400000, accounts: 44 }
  ],
  rollRate: [
    { from: "Current → 1–30", rate: 3.8, prior: 4.2 },
    { from: "1–30 → 31–60", rate: 21.4, prior: 19.7 },
    { from: "31–60 → 61–90", rate: 34.9, prior: 33.1 },
    { from: "61–90 → 91–180", rate: 41.2, prior: 44.8 },
    { from: "91–180 → 180+", rate: 28.6, prior: 27.9 }
  ],
  collectorPerformance: [
    { name: "Salman Sagar", role: "Officer", cases: 64, contacted: 58, ptpTaken: 31, ptpKept: 23, collected: 1840000 },
    { name: "Layla Al-Thani", role: "RM", cases: 47, contacted: 44, ptpTaken: 22, ptpKept: 14, collected: 2610000 },
    { name: "Rashid Al-Malki", role: "Workout", cases: 29, contacted: 27, ptpTaken: 11, ptpKept: 9, collected: 980000 },
    { name: "Hind Al-Attiyah", role: "Legal", cases: 18, contacted: 12, ptpTaken: 3, ptpKept: 2, collected: 3450000 }
  ],
  monthlyCollected: [
    { m: "Feb", hl: 4.1, bfd: 3.2 }, { m: "Mar", hl: 4.6, bfd: 3.9 }, { m: "Apr", hl: 5.2, bfd: 3.4 },
    { m: "May", hl: 4.9, bfd: 4.8 }, { m: "Jun", hl: 5.8, bfd: 5.1 }, { m: "Jul", hl: 6.3, bfd: 4.4 }
  ]
};

/** Ingestion runs. Cases are created in the CRM before this workspace ever sees them. */
const INTAKE_RUNS = [
  { id: "RUN-2026-0730", when: "2026-07-30 02:14", source: "Core Banking", org: "HL", read: 9820, newCases: 34, updated: 288, skipped: 6, failed: 0, status: "Completed" },
  { id: "RUN-2026-0730B", when: "2026-07-30 02:31", source: "Core Banking", org: "BFD", read: 6410, newCases: 21, updated: 174, skipped: 3, failed: 2, status: "Completed with errors" },
  { id: "RUN-2026-0729", when: "2026-07-29 02:12", source: "Core Banking", org: "HL", read: 9788, newCases: 29, updated: 301, skipped: 4, failed: 0, status: "Completed" },
  { id: "RUN-2026-0729B", when: "2026-07-29 02:29", source: "Core Banking", org: "BFD", read: 6392, newCases: 18, updated: 166, skipped: 5, failed: 0, status: "Completed" },
  { id: "RUN-2026-0728", when: "2026-07-28 02:15", source: "Core Banking", org: "HL", read: 9754, newCases: 41, updated: 279, skipped: 2, failed: 0, status: "Completed" }
];

/** Unresolved identities — the cost of two systems of record, surfaced rather than hidden. */
const IDENTITY_EXCEPTIONS = [
  { qid: "28607781234", hl: "—", bfd: "C-1003", issue: "No Housing Loan counterpart", action: "Single-org customer — no action" },
  { qid: "27905567123", hl: "C-1002", bfd: "C-1002", issue: "Matched on QID", action: "Linked" },
  { qid: "29904412887", hl: "C-1099", bfd: "C-2044", issue: "Name mismatch, QID identical", action: "Manual review required" },
  { qid: "—", hl: "C-1102", bfd: "—", issue: "QID missing on the CRM record", action: "Data quality — request update" }
];
