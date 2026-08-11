using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Reads the flat <c>{"name":"value"}</c> object of runtime parameter values the caller supplies.
    ///
    /// Deliberately minimal: the plugin assembly must stay self-contained (ADR-RPT-011) and net462
    /// has no JSON reader, but the accepted shape is one level of string-keyed scalars, so a general
    /// parser would be far more surface than the contract needs. Anything richer is rejected by
    /// being ignored rather than guessed at.
    /// </summary>
    internal static class ReportParameters
    {
        public static IReadOnlyDictionary<string, string> Parse(string json)
        {
            var values = new Dictionary<string, string>();
            if (string.IsNullOrWhiteSpace(json))
            {
                return values;
            }

            var reader = new ScalarObjectReader(json);
            string name;
            string value;
            while (reader.TryReadPair(out name, out value))
            {
                values[name] = value;
            }

            return values;
        }

        /// <summary>Walks a one-level JSON object, yielding each key and its scalar value as text.</summary>
        private sealed class ScalarObjectReader
        {
            private readonly string _json;
            private int _position;

            public ScalarObjectReader(string json)
            {
                _json = json;
                _position = json.IndexOf('{') + 1;
            }

            public bool TryReadPair(out string name, out string value)
            {
                name = null;
                value = null;

                SkipTo('"');
                if (_position >= _json.Length)
                {
                    return false;
                }

                name = ReadString();
                SkipTo(':');
                _position++;
                value = ReadScalar();
                return name != null;
            }

            private void SkipTo(char target)
            {
                while (_position < _json.Length && _json[_position] != target)
                {
                    _position++;
                }
            }

            /// <summary>Reads a quoted string starting at the opening quote, honouring escapes.</summary>
            private string ReadString()
            {
                _position++; // opening quote
                var text = new StringBuilder();

                while (_position < _json.Length && _json[_position] != '"')
                {
                    if (_json[_position] == '\\' && _position + 1 < _json.Length)
                    {
                        _position++;
                        text.Append(Unescape(ref _position));
                        continue;
                    }

                    text.Append(_json[_position]);
                    _position++;
                }

                _position++; // closing quote
                return text.ToString();
            }

            private char Unescape(ref int position)
            {
                var marker = _json[position];
                position++;

                switch (marker)
                {
                    case 'n': return '\n';
                    case 'r': return '\r';
                    case 't': return '\t';
                    case 'b': return '\b';
                    case 'f': return '\f';
                    case 'u':
                        var code = _json.Substring(position, 4);
                        position += 4;
                        return (char)int.Parse(code, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                    default: return marker;
                }
            }

            /// <summary>Reads a string, number, boolean or null and returns it as text (null stays null).</summary>
            private string ReadScalar()
            {
                while (_position < _json.Length && char.IsWhiteSpace(_json[_position]))
                {
                    _position++;
                }

                if (_position >= _json.Length)
                {
                    return null;
                }

                if (_json[_position] == '"')
                {
                    return ReadString();
                }

                var start = _position;
                while (_position < _json.Length && _json[_position] != ',' && _json[_position] != '}')
                {
                    _position++;
                }

                var literal = _json.Substring(start, _position - start).Trim();
                return literal == "null" || literal.Length == 0 ? null : literal;
            }
        }
    }
}
