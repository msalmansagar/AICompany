using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Reads the one JSON shape a static dataset uses: an array of flat objects whose values are
    /// strings, numbers, booleans or null.
    ///
    /// Hand-written because the plugin assembly must stay self-contained (ADR-RPT-011) and net462 has
    /// no System.Text.Json. Deliberately narrow — it does not attempt nested objects or arrays, and
    /// anything it cannot read yields no rows rather than a partial guess.
    /// </summary>
    internal static class SimpleJson
    {
        public static List<IReadOnlyDictionary<string, object>> ReadObjectArray(string json)
        {
            var rows = new List<IReadOnlyDictionary<string, object>>();
            if (string.IsNullOrWhiteSpace(json))
            {
                return rows;
            }

            try
            {
                var reader = new Reader(json);
                reader.SkipWhitespace();
                if (!reader.Take('[')) return rows;

                while (true)
                {
                    reader.SkipWhitespace();
                    if (reader.Take(']')) break;

                    var row = reader.ReadObject();
                    if (row == null) break;
                    rows.Add(row);

                    reader.SkipWhitespace();
                    if (!reader.Take(',')) { reader.Take(']'); break; }
                }
            }
            catch (Exception)
            {
                // A malformed dataset yields nothing; the report then shows no rows rather than failing.
                return new List<IReadOnlyDictionary<string, object>>();
            }

            return rows;
        }

        private sealed class Reader
        {
            private readonly string _json;
            private int _at;

            public Reader(string json) => _json = json;

            public void SkipWhitespace()
            {
                while (_at < _json.Length && char.IsWhiteSpace(_json[_at])) _at++;
            }

            public bool Take(char expected)
            {
                SkipWhitespace();
                if (_at < _json.Length && _json[_at] == expected) { _at++; return true; }
                return false;
            }

            public Dictionary<string, object> ReadObject()
            {
                if (!Take('{')) return null;
                var row = new Dictionary<string, object>(StringComparer.Ordinal);

                while (true)
                {
                    SkipWhitespace();
                    if (Take('}')) return row;

                    var key = ReadString();
                    if (key == null) return row;
                    if (!Take(':')) return row;
                    row[key] = ReadValue();

                    SkipWhitespace();
                    if (!Take(',')) { Take('}'); return row; }
                }
            }

            private string ReadString()
            {
                SkipWhitespace();
                if (_at >= _json.Length || _json[_at] != '"') return null;
                _at++;

                var text = new StringBuilder();
                while (_at < _json.Length && _json[_at] != '"')
                {
                    if (_json[_at] == '\\' && _at + 1 < _json.Length)
                    {
                        _at++;
                        text.Append(Unescape());
                        continue;
                    }

                    text.Append(_json[_at]);
                    _at++;
                }

                _at++; // closing quote
                return text.ToString();
            }

            private char Unescape()
            {
                var marker = _json[_at];
                _at++;
                switch (marker)
                {
                    case 'n': return '\n';
                    case 'r': return '\r';
                    case 't': return '\t';
                    case 'b': return '\b';
                    case 'f': return '\f';
                    case 'u':
                        var code = _json.Substring(_at, 4);
                        _at += 4;
                        return (char)int.Parse(code, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                    default: return marker;
                }
            }

            /// <summary>Scalars only — a nested object or array is skipped and read as null.</summary>
            private object ReadValue()
            {
                SkipWhitespace();
                if (_at >= _json.Length) return null;
                if (_json[_at] == '"') return ReadString();

                var start = _at;
                while (_at < _json.Length && _json[_at] != ',' && _json[_at] != '}') _at++;
                var literal = _json.Substring(start, _at - start).Trim();

                if (literal.Length == 0 || literal == "null") return null;
                if (literal == "true") return true;
                if (literal == "false") return false;
                if (double.TryParse(literal, NumberStyles.Any, CultureInfo.InvariantCulture, out var number)) return number;
                return literal;
            }
        }
    }
}
