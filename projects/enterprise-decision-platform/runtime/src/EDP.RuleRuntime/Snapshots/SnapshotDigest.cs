using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using EDP.RuleRuntime.Operators;

namespace EDP.RuleRuntime.Snapshots
{
    /// <summary>
    /// Deterministic digest over a captured fact set (FR-F34).
    ///
    /// "Deterministic" is the whole requirement: the same facts must hash identically on any
    /// machine, in any culture, in any dictionary enumeration order — otherwise the digest proves
    /// nothing. Keys are ordered, values are written in invariant form, and collections keep their
    /// own order because element order is part of the fact.
    /// </summary>
    public static class SnapshotDigest
    {
        public static string Compute(IReadOnlyDictionary<string, object?> inputs, DateTime capturedAtUtc)
        {
            var canonical = Canonicalise(inputs, capturedAtUtc);
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(canonical));
                return BitConverter.ToString(hash).Replace("-", string.Empty).ToLowerInvariant();
            }
        }

        /// <summary>The exact text that is hashed. Exposed because a digest nobody can reproduce is not evidence.</summary>
        public static string Canonicalise(IReadOnlyDictionary<string, object?> inputs, DateTime capturedAtUtc)
        {
            var builder = new StringBuilder();
            builder.Append("clock=").Append(capturedAtUtc.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture)).Append('\n');

            foreach (var key in inputs.Keys.OrderBy(k => k, StringComparer.Ordinal))
            {
                builder.Append(key).Append('=');
                AppendValue(builder, inputs[key]);
                builder.Append('\n');
            }
            return builder.ToString();
        }

        private static void AppendValue(StringBuilder builder, object? value)
        {
            if (value == null) { builder.Append("<null>"); return; }
            if (value is IReadOnlyDictionary<string, object?> record) { AppendRecord(builder, record); return; }
            if (RuntimeValue.IsCollection(value)) { AppendCollection(builder, value); return; }
            builder.Append(RuntimeValue.AsString(value));
        }

        /// <summary>Record fields are ordered by name — a field's position is not part of the fact.</summary>
        private static void AppendRecord(StringBuilder builder, IReadOnlyDictionary<string, object?> record)
        {
            builder.Append('{');
            var first = true;
            foreach (var field in record.Keys.OrderBy(k => k, StringComparer.Ordinal))
            {
                if (!first) builder.Append(',');
                builder.Append(field).Append(':');
                AppendValue(builder, record[field]);
                first = false;
            }
            builder.Append('}');
        }

        /// <summary>Element order IS part of the fact — a reordered population is a different one.</summary>
        private static void AppendCollection(StringBuilder builder, object collection)
        {
            builder.Append('[');
            var first = true;
            foreach (var element in RuntimeValue.AsCollection(collection))
            {
                if (!first) builder.Append(',');
                AppendValue(builder, element);
                first = false;
            }
            builder.Append(']');
        }
    }
}
