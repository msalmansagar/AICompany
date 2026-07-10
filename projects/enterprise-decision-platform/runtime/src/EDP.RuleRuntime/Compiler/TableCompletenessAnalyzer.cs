using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using EDP.RuleRuntime.Execution;
using EDP.RuleRuntime.Pcrm;

namespace EDP.RuleRuntime.Compiler
{
    /// <summary>
    /// Static completeness/overlap analysis for decision tables (no execution). Flags rows that
    /// can never fire, redundant rows, overlapping rows, and a missing catch-all. All findings are
    /// Warnings — they are advisory quality hints, never blocking. The analysis is CONSERVATIVE:
    /// a claim is only made when it can be proven from the cells, so there are no false positives
    /// (operators/values it can't reason about are treated as opaque and simply not reported).
    /// </summary>
    public static class TableCompletenessAnalyzer
    {
        public static IReadOnlyList<RuleDiagnostic> Analyze(PcrmDocument doc)
        {
            var findings = new List<RuleDiagnostic>();
            var logic = doc.Logic;
            if (!string.Equals(logic.Type, "decisionTable", StringComparison.OrdinalIgnoreCase)) return findings;

            var columns = logic.TableInputs;
            var rows = logic.Rows;
            if (columns.Count == 0 || rows.Count == 0) return findings;

            var numericCol = columns.Select(c => IsNumeric(doc, c.Field)).ToArray();
            // predicates[row][col]
            var predicates = rows.Select(r => Enumerable.Range(0, columns.Count)
                .Select(ci => Build(ci < r.Cells.Count ? r.Cells[ci] : Wild, numericCol[ci])).ToArray()).ToArray();

            var hp = logic.HitPolicy ?? "First";
            var ordered = hp.Equals("First", StringComparison.OrdinalIgnoreCase) || hp.Equals("Priority", StringComparison.OrdinalIgnoreCase);

            for (var i = 0; i < rows.Count; i++)
            {
                // Unreachable (ordered policies): an earlier row already covers every case row i would.
                if (ordered)
                {
                    for (var j = 0; j < i; j++)
                    {
                        if (Covers(predicates[j], predicates[i]))
                        {
                            findings.Add(new RuleDiagnostic("EDP020",
                                $"Row {i + 1} can never match — row {j + 1} already covers every case it would (earlier row wins under '{hp}').",
                                RuleErrorSeverity.Warning, $"row {i + 1}"));
                            break;
                        }
                    }
                }

                for (var j = 0; j < i; j++)
                {
                    // Redundant: two rows with identical conditions.
                    if (Identical(rows[j], rows[i]))
                        findings.Add(new RuleDiagnostic("EDP021",
                            $"Rows {j + 1} and {i + 1} have identical conditions (one is redundant).",
                            RuleErrorSeverity.Warning, $"row {i + 1}"));
                    // Overlap: for unordered policies, two rows that can both match the same input.
                    else if (!ordered && Overlap(predicates[j], predicates[i]))
                        findings.Add(new RuleDiagnostic("EDP022",
                            $"Rows {j + 1} and {i + 1} can both match the same input — ambiguous under '{hp}'.",
                            RuleErrorSeverity.Warning, $"row {i + 1}"));
                }
            }

            // Missing catch-all: an ordered table with no default and no all-wildcard row may leave inputs undecided.
            if (ordered && logic.DefaultRow == null && !rows.Any(IsCatchAll))
                findings.Add(new RuleDiagnostic("EDP023",
                    "No default row and no catch-all row — inputs that match no row get no decision.",
                    RuleErrorSeverity.Warning));

            return findings;
        }

        private static readonly PcrmCell Wild = new PcrmCell { Any = true };

        private static bool IsCatchAll(PcrmTableRow r) => r.Cells.Count > 0 && r.Cells.All(IsWild);
        private static bool IsWild(PcrmCell c) => c.Any || c.Operator.Equals("Any", StringComparison.OrdinalIgnoreCase);

        private static bool Covers(Pred[] outer, Pred[] inner)
        {
            for (var c = 0; c < inner.Length; c++)
                if (!inner[c].SubsetOf(outer[c])) return false;
            return true;
        }

        private static bool Overlap(Pred[] a, Pred[] b)
        {
            for (var c = 0; c < a.Length; c++)
                if (!a[c].Overlaps(b[c])) return false;
            return true;
        }

        private static bool Identical(PcrmTableRow a, PcrmTableRow b)
        {
            if (a.Cells.Count != b.Cells.Count) return false;
            for (var i = 0; i < a.Cells.Count; i++)
            {
                var x = a.Cells[i]; var y = b.Cells[i];
                if (IsWild(x) && IsWild(y)) continue;
                if (IsWild(x) != IsWild(y)) return false;
                if (!string.Equals(x.Operator, y.Operator, StringComparison.OrdinalIgnoreCase)) return false;
                if (x.ValueField != y.ValueField) return false;
                if (x.Value.GetRawText() != y.Value.GetRawText()) return false;
            }
            return true;
        }

        private static bool IsNumeric(PcrmDocument doc, string inputName)
        {
            var t = doc.Inputs.FirstOrDefault(i => string.Equals(i.Name, inputName, StringComparison.OrdinalIgnoreCase))?.Type ?? "";
            return t.Equals("Decimal", StringComparison.OrdinalIgnoreCase) || t.Equals("Currency", StringComparison.OrdinalIgnoreCase)
                || t.Equals("Integer", StringComparison.OrdinalIgnoreCase) || t.Equals("WholeNumber", StringComparison.OrdinalIgnoreCase)
                || t.Equals("Double", StringComparison.OrdinalIgnoreCase) || t.Equals("Number", StringComparison.OrdinalIgnoreCase);
        }

        // ---- cell → predicate --------------------------------------------------------------

        private static Pred Build(PcrmCell cell, bool numeric)
        {
            if (cell.Any || cell.Operator.Equals("Any", StringComparison.OrdinalIgnoreCase)) return Pred.Universe;
            if (cell.ValueField != null) return Pred.Opaque; // field-to-field — unknown statically

            if (numeric)
            {
                var v = AsDouble(cell.Value);
                switch (cell.Operator.ToLowerInvariant())
                {
                    case "equals": return v.HasValue ? Pred.Interval(v, v, true, true) : Pred.Opaque;
                    case "greaterthan": return v.HasValue ? Pred.Interval(v, null, false, false) : Pred.Opaque;
                    case "greaterthanorequal": return v.HasValue ? Pred.Interval(v, null, true, false) : Pred.Opaque;
                    case "lessthan": return v.HasValue ? Pred.Interval(null, v, false, false) : Pred.Opaque;
                    case "lessthanorequal": return v.HasValue ? Pred.Interval(null, v, false, true) : Pred.Opaque;
                    case "between":
                        var v2 = AsDouble(cell.Value2);
                        return v.HasValue && v2.HasValue ? Pred.Interval(v, v2, true, true) : Pred.Opaque;
                    default: return Pred.Opaque; // NotEquals / In / IsNull etc.
                }
            }

            // discrete (text / optionset)
            switch (cell.Operator.ToLowerInvariant())
            {
                case "equals": return Pred.Set(AsString(cell.Value));
                case "in": return Pred.Set(AsList(cell.Value));
                default: return Pred.Opaque;
            }
        }

        private static double? AsDouble(JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Number && e.TryGetDouble(out var d)) return d;
            if (e.ValueKind == JsonValueKind.String && double.TryParse(e.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var s)) return s;
            return null;
        }
        private static string AsString(JsonElement e) => e.ValueKind == JsonValueKind.String ? (e.GetString() ?? "") : e.GetRawText();
        private static IEnumerable<string> AsList(JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Array) return e.EnumerateArray().Select(AsString);
            return AsString(e).Split(',').Select(s => s.Trim());
        }

        // ---- predicate model ----------------------------------------------------------------

        private sealed class Pred
        {
            private enum Kind { Universe, Opaque, Interval, Set }
            private readonly Kind _kind;
            private readonly double? _lo, _hi; private readonly bool _loInc, _hiInc;
            private readonly HashSet<string>? _set;

            private Pred(Kind k, double? lo = null, double? hi = null, bool loInc = false, bool hiInc = false, HashSet<string>? set = null)
            { _kind = k; _lo = lo; _hi = hi; _loInc = loInc; _hiInc = hiInc; _set = set; }

            public static readonly Pred Universe = new Pred(Kind.Universe);
            public static readonly Pred Opaque = new Pred(Kind.Opaque);
            public static Pred Interval(double? lo, double? hi, bool loInc, bool hiInc) => new Pred(Kind.Interval, lo, hi, loInc, hiInc);
            public static Pred Set(string v) => new Pred(Kind.Set, set: new HashSet<string>(StringComparer.OrdinalIgnoreCase) { v });
            public static Pred Set(IEnumerable<string> v) => new Pred(Kind.Set, set: new HashSet<string>(v, StringComparer.OrdinalIgnoreCase));

            /// <summary>Provably overlaps (both can be satisfied by some value). Conservative: false when unknown.</summary>
            public bool Overlaps(Pred o)
            {
                if (_kind == Kind.Opaque || o._kind == Kind.Opaque) return false;
                if (_kind == Kind.Universe || o._kind == Kind.Universe) return true;
                if (_kind == Kind.Interval && o._kind == Kind.Interval) return IntervalsIntersect(this, o);
                if (_kind == Kind.Set && o._kind == Kind.Set) return _set!.Overlaps(o._set!);
                return false; // mixed / unknown
            }

            /// <summary>Provably a subset of <paramref name="o"/> (this ⊆ o). Conservative: false when unknown.</summary>
            public bool SubsetOf(Pred o)
            {
                if (o._kind == Kind.Universe) return true;               // everything ⊆ all
                if (_kind == Kind.Universe) return false;                 // all ⊄ a proper subset
                if (_kind == Kind.Opaque || o._kind == Kind.Opaque) return false;
                if (_kind == Kind.Interval && o._kind == Kind.Interval) return IntervalWithin(this, o);
                if (_kind == Kind.Set && o._kind == Kind.Set) return _set!.IsSubsetOf(o._set!);
                return false;
            }

            private static bool IntervalsIntersect(Pred a, Pred b)
            {
                // lower bound of the intersection
                var (loA, loB) = (a._lo, b._lo);
                var lo = loA is null ? loB : loB is null ? loA : Math.Max(loA.Value, loB.Value);
                var hiA = a._hi; var hiB = b._hi;
                var hi = hiA is null ? hiB : hiB is null ? hiA : Math.Min(hiA.Value, hiB.Value);
                if (lo is null || hi is null) return true; // one side unbounded through the overlap
                if (lo.Value < hi.Value) return true;
                if (lo.Value > hi.Value) return false;
                // equal endpoints: overlap only if both sides include that point
                var loInc = (loA is null || a._lo!.Value < lo.Value || a._loInc) && (loB is null || b._lo!.Value < lo.Value || b._loInc);
                var hiInc = (hiA is null || a._hi!.Value > hi.Value || a._hiInc) && (hiB is null || b._hi!.Value > hi.Value || b._hiInc);
                return loInc && hiInc;
            }

            private static bool IntervalWithin(Pred inner, Pred outer)
            {
                bool loOk = outer._lo is null || (inner._lo is not null &&
                    (inner._lo.Value > outer._lo.Value || (inner._lo.Value == outer._lo.Value && (!inner._loInc || outer._loInc))));
                bool hiOk = outer._hi is null || (inner._hi is not null &&
                    (inner._hi.Value < outer._hi.Value || (inner._hi.Value == outer._hi.Value && (!inner._hiInc || outer._hiInc))));
                return loOk && hiOk;
            }
        }
    }
}
