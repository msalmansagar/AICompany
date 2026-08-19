using System;
using System.Collections.Generic;
using EDP.RuleRuntime;
using EDP.RuleRuntime.Metadata;
using Xunit;

namespace EDP.RuleRuntime.Tests
{
    /// <summary>
    /// The customer's three worked examples, executed.
    ///
    /// This is the specimen behind EDP-FACT-001 — the requirement that revealed the capability
    /// class — turned into acceptance tests. It proves the DECISION LOGIC of the duplicate check
    /// (G3) on the exact data the business supplied, using only what the engine can express today.
    ///
    /// It deliberately supplies the historical population as an input rather than retrieving it.
    /// Retrieval is F2b and needs an org; the predicate is what is under test here.
    ///
    /// Match key per the business decisions of 2026-08-19:
    ///   C-6 beneficiary identity = name AND account AND IBAN, all three
    ///   C-1 amount is a required conjunct today, and must be configurable later
    ///   C-2 a line-item ref match is sufficient on its own, invoice numbers need not agree
    /// </summary>
    public class DuplicateInvoiceSpecimenTests
    {
        private static readonly DateTime Now = new DateTime(2026, 8, 19, 0, 0, 0, DateTimeKind.Utc);

        /// <summary>
        /// Historical fields carry a "hist" prefix deliberately. Inside a quantifier body an
        /// element's fields SHADOW outer symbols of the same name (F1), so a child-to-parent
        /// comparison is only expressible when the two sides are named differently.
        /// </summary>
        private const string DuplicateRule = """
        {
          "ruleId": "dup", "name": "G3 duplicate invoice", "targetEntity": "qdb_disbursementrequest",
          "inputs": [
            { "name": "invoiceNo", "type": "Text" },
            { "name": "lineRefs", "type": "Text" },
            { "name": "amount", "type": "Decimal" },
            { "name": "beneficiaryName", "type": "Text" },
            { "name": "beneficiaryAccount", "type": "Text" },
            { "name": "beneficiaryIban", "type": "Text" },
            { "name": "history", "type": "Text" }
          ],
          "outputs": [ { "name": "duplicate", "type": "Text" } ],
          "logic": {
            "type": "conditionSet",
            "rules": [
              { "when": { "op": "and", "quantifiers": [
                  { "kind": "some", "collection": "history", "where": { "op": "and",
                      "conditions": [
                        { "field": "histBeneficiaryName",    "operator": "Equals", "valueField": "beneficiaryName" },
                        { "field": "histBeneficiaryAccount", "operator": "Equals", "valueField": "beneficiaryAccount" },
                        { "field": "histBeneficiaryIban",    "operator": "Equals", "valueField": "beneficiaryIban" },
                        { "field": "histAmount",             "operator": "Equals", "valueField": "amount" }
                      ],
                      "groups": [
                        { "op": "or", "conditions": [
                          { "field": "histInvoiceNo", "operator": "Equals", "valueField": "invoiceNo" },
                          { "field": "histLineRef",   "operator": "In",     "valueField": "lineRefs" }
                        ] }
                      ] } }
              ] }, "then": { "duplicate": "Yes" }, "reasonCodes": [ "DUP_INVOICE_OR_LINE_REF" ] }
            ],
            "otherwise": { "duplicate": "No" }
          }
        }
        """;

        private const string Ahmad = "Ahmad", AhmadAccount = "123456", AhmadIban = "52147898";
        private const string Mukesh = "Mukesh", MukeshAccount = "524478", MukeshIban = "85478977";

        private static object? Historic(string invoiceNo, string lineRef, decimal amount,
            string name, string account, string iban)
            => new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["histInvoiceNo"] = invoiceNo,
                ["histLineRef"] = lineRef,
                ["histAmount"] = amount,
                ["histBeneficiaryName"] = name,
                ["histBeneficiaryAccount"] = account,
                ["histBeneficiaryIban"] = iban,
            };

        /// <summary>One invoice of DR10001, checked against the DR10002 population.</summary>
        private static string CheckInvoice(string invoiceNo, IReadOnlyList<string> lineRefs, decimal amount,
            List<object?> history)
        {
            var inputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["invoiceNo"] = invoiceNo,
                ["lineRefs"] = new List<object?>(lineRefs),
                ["amount"] = amount,
                ["beneficiaryName"] = Ahmad,
                ["beneficiaryAccount"] = AhmadAccount,
                ["beneficiaryIban"] = AhmadIban,
                ["history"] = history,
            };

            var result = new RuleRuntimeService(new InMemoryMetadataResolver()).Execute(DuplicateRule, inputs, Now);
            Assert.True(result.Success, string.Join("; ", result.Diagnostics));
            return (string)result.Outputs["duplicate"]!;
        }

        // ---- Table 1 — same invoice number and same supplier in DR10002 -------------------

        private static List<object?> Table1History() => new List<object?>
        {
            Historic("1", "11", 5000m, Ahmad, AhmadAccount, AhmadIban),
            Historic("5", "51", 5000m, Ahmad, AhmadAccount, AhmadIban),
        };

        [Fact]
        public void Table1_invoice1_is_a_duplicate_because_invoice_no_and_supplier_match()
            => Assert.Equal("Yes", CheckInvoice("1", new[] { "11", "12" }, 5000m, Table1History()));

        [Fact]
        public void Table1_invoice2_is_not_a_duplicate()
            => Assert.Equal("No", CheckInvoice("2", new[] { "21" }, 100000m, Table1History()));

        // ---- Table 2 — same invoice number but a DIFFERENT supplier ----------------------

        [Fact]
        public void Table2_invoice1_is_not_a_duplicate_because_the_beneficiary_differs()
        {
            // The load-bearing negative control: beneficiary equality is a required conjunct,
            // not corroborating evidence.
            var history = new List<object?>
            {
                Historic("1", "11", 5000m, Mukesh, MukeshAccount, MukeshIban),
                Historic("5", "51", 5000m, Ahmad, AhmadAccount, AhmadIban),
            };

            Assert.Equal("No", CheckInvoice("1", new[] { "11", "12" }, 5000m, history));
        }

        // ---- Table 3 — different invoice number, SAME line-item refs ---------------------

        [Fact]
        public void Table3_invoice1_is_a_duplicate_because_the_line_item_refs_match()
        {
            // The supplier re-issued the same lines under invoice 4. Invoice numbers disagree,
            // so only the line-ref limb can catch this.
            var history = new List<object?>
            {
                Historic("4", "11", 5000m, Ahmad, AhmadAccount, AhmadIban),
                Historic("4", "12", 5000m, Ahmad, AhmadAccount, AhmadIban),
                Historic("5", "51", 5000m, Ahmad, AhmadAccount, AhmadIban),
            };

            Assert.Equal("Yes", CheckInvoice("1", new[] { "11", "12" }, 5000m, history));
        }

        [Fact]
        public void Table3_invoice2_is_still_not_a_duplicate()
        {
            var history = new List<object?>
            {
                Historic("4", "11", 5000m, Ahmad, AhmadAccount, AhmadIban),
                Historic("5", "51", 5000m, Ahmad, AhmadAccount, AhmadIban),
            };

            Assert.Equal("No", CheckInvoice("2", new[] { "21" }, 100000m, history));
        }

        // ---- consequences of the business decisions --------------------------------------

        [Fact]
        public void An_empty_history_yields_no_duplicate()
            => Assert.Equal("No", CheckInvoice("1", new[] { "11" }, 5000m, new List<object?>()));

        [Fact]
        public void Amount_is_a_required_conjunct_today_so_a_changed_amount_escapes_detection()
        {
            // C-1: mandatory today, and the business asked for it to become configurable. This
            // test states the cost of that choice plainly — a supplier re-submitting the same
            // invoice with an altered amount is NOT caught while amount is part of the key.
            var history = new List<object?> { Historic("1", "11", 4999m, Ahmad, AhmadAccount, AhmadIban) };

            Assert.Equal("No", CheckInvoice("1", new[] { "11" }, 5000m, history));
        }

        [Fact]
        public void An_ocr_variant_of_the_beneficiary_name_escapes_detection()
        {
            // C-6 requires name AND account AND IBAN to match. The name is OCR-extracted, so a
            // variant defeats the check even when the banking details are identical. Recorded as
            // executable evidence for the canonicalisation decision still open as Q-11.
            var history = new List<object?> { Historic("1", "11", 5000m, "AHMAD", AhmadAccount, AhmadIban) };

            Assert.Equal("No", CheckInvoice("1", new[] { "11" }, 5000m, history));
        }
    }
}
