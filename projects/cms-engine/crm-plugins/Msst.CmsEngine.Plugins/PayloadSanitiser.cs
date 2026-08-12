using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>What sanitising a whole page payload produced.</summary>
    public sealed class SanitisedPayload
    {
        public SanitisedPayload(string json, IReadOnlyCollection<string> removed, string rejection)
        {
            Json = json;
            Removed = removed;
            Rejection = rejection;
        }

        public string Json { get; }

        public IReadOnlyCollection<string> Removed { get; }

        public string Rejection { get; }

        public bool IsRejected => Rejection != null;

        public bool WasChanged => Removed.Count > 0;
    }

    /// <summary>
    /// Applies <see cref="RichTextSanitiser"/> to every rich-text value in a page.
    /// </summary>
    /// <remarks>
    /// Rich-text values are identified by the block's field name rather than by
    /// sniffing for angle brackets. Sniffing would sanitise a plain-text field
    /// that happens to mention "&lt;" and would miss a rich-text field an author
    /// left as bare words.
    ///
    /// A page is a tree of blocks, each with props, and bilingual values are
    /// objects keyed by locale — so every locale of every rich-text field is
    /// visited, not just English. An Arabic-only injection would otherwise
    /// travel straight through.
    /// </remarks>
    public static class PayloadSanitiser
    {
        /// <summary>Prop names carrying rich text. Kept beside the block library.</summary>
        private static readonly HashSet<string> RichTextProps = new HashSet<string>
        {
            "body", "content", "intro", "richText",
        };

        public static SanitisedPayload Sanitise(string json)
        {
            JObject page;
            try
            {
                page = JObject.Parse(json);
            }
            catch (Newtonsoft.Json.JsonException error)
            {
                return new SanitisedPayload(null, new string[0], "the page payload is not valid JSON: " + error.Message);
            }

            var removed = new List<string>();

            foreach (var value in FindRichTextValues(page))
            {
                var result = RichTextSanitiser.Sanitise(value.Value<string>());
                if (result.IsRejected)
                {
                    return new SanitisedPayload(null, removed, "rich text was refused because " + result.Rejection);
                }

                if (result.Removed.Count > 0)
                {
                    removed.AddRange(result.Removed);
                    value.Replace(new JValue(result.Html));
                }
            }

            return new SanitisedPayload(page.ToString(Newtonsoft.Json.Formatting.None), removed, null);
        }

        /// <summary>
        /// Every string sitting under a rich-text prop, at any depth and in any
        /// locale. Materialised before rewriting, because replacing a token
        /// while walking the tree invalidates the walk.
        /// </summary>
        private static List<JValue> FindRichTextValues(JObject page)
        {
            var found = new List<JValue>();

            foreach (var property in page.Descendants().OfType<JProperty>())
            {
                if (!RichTextProps.Contains(property.Name)) continue;

                if (property.Value is JValue direct && direct.Type == JTokenType.String)
                {
                    found.Add(direct);
                    continue;
                }

                // Bilingual: { en: "...", ar: "..." }
                if (property.Value is JObject perLocale)
                {
                    found.AddRange(
                        perLocale.Properties()
                            .Select(locale => locale.Value)
                            .OfType<JValue>()
                            .Where(value => value.Type == JTokenType.String));
                }
            }

            return found;
        }
    }
}
