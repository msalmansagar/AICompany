using System.Collections.Generic;
using System.Linq;

namespace Qdb.SurveyEngine.Activation
{
    /// <summary>
    /// Checks that every status and type code a source's triggers use exists in the table's own
    /// metadata (FR-CSE-004, section 18b). A mistyped code would otherwise make a trigger silently
    /// never fire.
    /// </summary>
    public static class TriggerCodeValidator
    {
        /// <summary>One line per unknown code; empty when everything is valid.</summary>
        /// <param name="triggers">The source's triggers and their codes.</param>
        /// <param name="validCodes">Valid codes per column; a null set means the column could not be read as a choice.</param>
        public static IReadOnlyList<string> FindUnknownCodes(IEnumerable<TriggerCodes> triggers, ValidSourceCodes validCodes)
        {
            return triggers.SelectMany(trigger =>
                    Unknown(trigger.TriggerName, "status", trigger.StatusCodes, validCodes.Status)
                        .Concat(Unknown(trigger.TriggerName, "type", trigger.TypeCodes, validCodes.Type)))
                .ToList();
        }

        private static IEnumerable<string> Unknown(string triggerName, string kind, IEnumerable<string> codes, IReadOnlyCollection<string> valid)
        {
            if (valid == null) return codes.Any() ? new[] { $"{triggerName}: the source's {kind} field is not a choice column, so its {kind} codes cannot be checked." } : new string[0];
            return codes.Where(code => !valid.Contains(code)).Select(code => $"{triggerName}: {kind} code {code} does not exist on the table.");
        }
    }

    /// <summary>The valid codes of a source's status and type columns.</summary>
    public sealed class ValidSourceCodes
    {
        public IReadOnlyCollection<string> Status { get; set; }
        public IReadOnlyCollection<string> Type { get; set; }
    }
}
