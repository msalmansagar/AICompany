using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace Msst.CmsEngine.Plugins
{
    /// <summary>What sanitising one rich-text value produced.</summary>
    public sealed class SanitisedHtml
    {
        public SanitisedHtml(string html, IReadOnlyCollection<string> removed, string rejection)
        {
            Html = html;
            Removed = removed;
            Rejection = rejection;
        }

        /// <summary>The cleaned fragment. Meaningless when <see cref="Rejection"/> is set.</summary>
        public string Html { get; }

        /// <summary>Names of elements and attributes that were taken out.</summary>
        public IReadOnlyCollection<string> Removed { get; }

        /// <summary>Why the value cannot be published, or null when it can.</summary>
        public string Rejection { get; }

        public bool IsRejected => Rejection != null;
    }

    /// <summary>
    /// Reduces a rich-text fragment to the closed set architecture §6 permits.
    /// </summary>
    /// <remarks>
    /// "Rich text" is unbounded; a governed CMS cannot be. The editor constrains
    /// what an author can type, but it cannot constrain what an author can write
    /// to the Web API, so this runs at publish — the same reasoning that puts the
    /// audit row and the size gate in the plugin.
    ///
    /// The approach is parse-then-allowlist, never pattern-matching. Stripping
    /// dangerous markup with regular expressions is a well-known way to produce
    /// a sanitiser that looks right and is not: nesting, malformed tags and
    /// encoded delimiters all defeat it. A fragment that cannot be parsed is
    /// refused rather than guessed at.
    /// </remarks>
    public static class RichTextSanitiser
    {
        /// <summary>Exactly §6's list. H1 is absent deliberately.</summary>
        private static readonly HashSet<string> AllowedElements = new HashSet<string>(
            StringComparer.OrdinalIgnoreCase)
        {
            "p", "strong", "b", "em", "i", "ul", "ol", "li", "a", "h2", "h3", "h4",
        };

        /// <summary>
        /// Elements discarded with everything inside them, rather than unwrapped.
        /// </summary>
        /// <remarks>
        /// The distinction matters and is easy to get wrong. Unwrapping keeps an
        /// element's text, which is right for a disallowed heading — the author's
        /// words survive. It is wrong for these: unwrapping a script tag leaves
        /// its source as visible page text. Inert, but it means a page reading
        /// "alert(document.cookie)" to every visitor.
        /// </remarks>
        private static readonly HashSet<string> DiscardedElements = new HashSet<string>(
            StringComparer.OrdinalIgnoreCase)
        {
            "script", "style", "iframe", "object", "embed", "applet", "noscript",
            "template", "svg", "math", "form", "input", "button", "select",
            "textarea", "option", "link", "meta", "base", "title", "head",
        };

        /// <summary>Only links carry an attribute, and only one.</summary>
        private static readonly HashSet<string> AllowedAttributes = new HashSet<string>(
            StringComparer.OrdinalIgnoreCase) { "href" };

        /// <summary>Schemes that execute or smuggle a payload.</summary>
        private static readonly string[] ForbiddenSchemes = { "javascript:", "data:", "vbscript:" };

        /// <summary>
        /// Entities a browser knows and an XML parser does not. Replaced before
        /// parsing so ordinary authored text does not read as malformed.
        /// </summary>
        private static readonly (string Entity, string Replacement)[] NamedEntities =
        {
            ("&nbsp;", " "), ("&mdash;", "—"), ("&ndash;", "–"),
            ("&ldquo;", "“"), ("&rdquo;", "”"), ("&lsquo;", "‘"),
            ("&rsquo;", "’"), ("&hellip;", "…"), ("&copy;", "©"),
        };

        private static readonly Regex VoidBreak = new Regex(@"<br\s*/?>", RegexOptions.IgnoreCase);
        private static readonly Regex SelfClosingHr = new Regex(@"<hr\s*/?>", RegexOptions.IgnoreCase);

        public static SanitisedHtml Sanitise(string html)
        {
            if (string.IsNullOrWhiteSpace(html))
            {
                return new SanitisedHtml(html ?? string.Empty, new string[0], null);
            }

            XElement parsed;
            try
            {
                parsed = XElement.Parse("<root>" + Normalise(html) + "</root>", LoadOptions.PreserveWhitespace);
            }
            catch (XmlException error)
            {
                return new SanitisedHtml(
                    null,
                    new string[0],
                    "the markup could not be parsed and so cannot be checked (" + error.Message + ")");
            }

            var removed = new List<string>();
            var rejection = Clean(parsed, removed);
            if (rejection != null) return new SanitisedHtml(null, removed, rejection);

            var cleaned = Render(parsed);

            // Markup that survives with no words is either a broken paste or an
            // attempt to smuggle structure. Either way there is nothing to read.
            if (removed.Count > 0 && string.IsNullOrWhiteSpace(parsed.Value))
            {
                return new SanitisedHtml(null, removed, "nothing readable remained after disallowed markup was removed");
            }

            return new SanitisedHtml(cleaned, removed, null);
        }

        /// <summary>Makes browser-tolerant HTML parseable as XML.</summary>
        private static string Normalise(string html)
        {
            var working = html;
            foreach (var entity in NamedEntities)
            {
                working = working.Replace(entity.Entity, entity.Replacement);
            }

            // Neither is permitted, so both become whitespace rather than being
            // deleted — otherwise words either side run together.
            working = VoidBreak.Replace(working, " ");
            working = SelfClosingHr.Replace(working, " ");
            return working;
        }

        /// <summary>
        /// Walks the tree, unwrapping disallowed elements and dropping
        /// disallowed attributes. Returns a rejection reason, or null.
        /// </summary>
        private static string Clean(XElement element, List<string> removed)
        {
            foreach (var child in element.Elements().ToList())
            {
                // Checked before descending: there is no reason to walk inside
                // something that is about to be deleted whole.
                if (DiscardedElements.Contains(child.Name.LocalName))
                {
                    removed.Add("<" + child.Name.LocalName + ">");
                    child.Remove();
                    continue;
                }

                var rejection = Clean(child, removed);
                if (rejection != null) return rejection;

                if (!AllowedElements.Contains(child.Name.LocalName))
                {
                    removed.Add("<" + child.Name.LocalName + ">");
                    Unwrap(child);
                    continue;
                }

                foreach (var attribute in child.Attributes().ToList())
                {
                    if (!AllowedAttributes.Contains(attribute.Name.LocalName))
                    {
                        removed.Add(child.Name.LocalName + "@" + attribute.Name.LocalName);
                        attribute.Remove();
                        continue;
                    }

                    var forbidden = ForbiddenScheme(attribute.Value);
                    if (forbidden != null)
                    {
                        return "a link uses the '" + forbidden + "' scheme, which is not permitted";
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// Replaces an element with its children. Text is kept because removing
        /// a disallowed wrapper should not silently delete an author's words.
        /// </summary>
        private static void Unwrap(XElement element)
        {
            var replacement = element.Nodes().ToList();
            if (replacement.Count == 0)
            {
                element.Remove();
                return;
            }

            foreach (var node in replacement)
            {
                node.Remove();
                element.AddBeforeSelf(node);
            }
            element.Remove();
        }

        private static string ForbiddenScheme(string value)
        {
            var collapsed = new string((value ?? string.Empty)
                .Where(character => !char.IsWhiteSpace(character) && character != '\0')
                .ToArray());

            return ForbiddenSchemes.FirstOrDefault(
                scheme => collapsed.StartsWith(scheme, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>Renders the children of the wrapper, not the wrapper itself.</summary>
        private static string Render(XElement root)
        {
            var builder = new StringBuilder();
            foreach (var node in root.Nodes())
            {
                builder.Append(node.ToString(SaveOptions.DisableFormatting));
            }
            return builder.ToString();
        }
    }
}
