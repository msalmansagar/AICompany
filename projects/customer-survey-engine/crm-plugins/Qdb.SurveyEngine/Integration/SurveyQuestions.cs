using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.Serialization;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// The questions of a published survey, read from the DFE runtime JSON (FormDefinitionModel):
    /// tabs → sections → fields in display order, which is the question order (FR-CSE-021).
    /// </summary>
    public sealed class SurveyQuestions
    {
        private readonly Dictionary<string, SurveyQuestion> _byCode;

        private SurveyQuestions(IReadOnlyList<SurveyQuestion> ordered)
        {
            _byCode = ordered.GroupBy(q => q.Code, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);
        }

        /// <summary>Parses the runtime JSON; fields without a schema name (labels, info cards) are not questions.</summary>
        public static SurveyQuestions FromRuntimeJson(string runtimeJson)
        {
            var form = JsonText.Read<RuntimeForm>(runtimeJson, "The published survey");
            var fields = (form.Tabs ?? new List<RuntimeTab>()).OrderBy(t => t.DisplayOrder)
                .SelectMany(t => (t.Sections ?? new List<RuntimeSection>()).OrderBy(s => s.DisplayOrder))
                .SelectMany(s => (s.Fields ?? new List<RuntimeField>()).OrderBy(f => f.DisplayOrder))
                .Where(f => !string.IsNullOrWhiteSpace(f.SchemaName));
            return new SurveyQuestions(fields.Select((field, index) => new SurveyQuestion(field, index + 1)).ToList());
        }

        /// <summary>The question with this code, or null when the survey has none.</summary>
        public SurveyQuestion Find(string code) => code != null && _byCode.TryGetValue(code, out var question) ? question : null;
    }

    /// <summary>One question and how its answers are normalised for views and charts (FR-CSE-057).</summary>
    public sealed class SurveyQuestion
    {
        private const char MultiValueSeparator = ',';
        private static readonly HashSet<string> NumericFieldTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "number", "decimal", "currency" };
        private readonly Dictionary<string, string> _optionLabels;

        internal SurveyQuestion(RuntimeField field, int order)
        {
            Code = field.SchemaName;
            Label = field.Label;
            Order = order;
            // Only a star rating or a number question is a score; a choice's option code ("1" = Portal) is not.
            IsScored = string.Equals(field.RadioRenderStyle, "rating", StringComparison.OrdinalIgnoreCase) || NumericFieldTypes.Contains(field.FieldType ?? string.Empty);
            _optionLabels = (field.Options ?? new List<RuntimeOption>()).Where(o => o.Value != null)
                .GroupBy(o => o.Value, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.First().Label, StringComparer.Ordinal);
        }

        public string Code { get; }
        public string Label { get; }
        public int Order { get; }

        /// <summary>True for a star rating or a number question, whose answer is also stored as a number for charts.</summary>
        public bool IsScored { get; }

        /// <summary>
        /// The answer row: option values become their labels (several are comma-separated), and a scored
        /// question's value, such as a star rating, is also kept as a number so it can be charted.
        /// </summary>
        public AnswerRow Answer(string value) => new AnswerRow
        {
            QuestionCode = Code,
            QuestionLabel = Label,
            QuestionOrder = Order,
            AnswerText = DisplayText(value),
            AnswerNumeric = IsScored && decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ? number : (decimal?)null,
        };

        private string DisplayText(string value)
        {
            if (string.IsNullOrEmpty(value) || _optionLabels.Count == 0) return value;
            var parts = value.Split(MultiValueSeparator).Select(part => part.Trim());
            return string.Join(", ", parts.Select(part => _optionLabels.TryGetValue(part, out var label) && !string.IsNullOrEmpty(label) ? label : part));
        }
    }

    [DataContract]
    internal sealed class RuntimeForm
    {
        [DataMember(Name = "tabs")] public List<RuntimeTab> Tabs { get; set; }
    }

    [DataContract]
    internal sealed class RuntimeTab
    {
        [DataMember(Name = "displayOrder")] public int DisplayOrder { get; set; }
        [DataMember(Name = "sections")] public List<RuntimeSection> Sections { get; set; }
    }

    [DataContract]
    internal sealed class RuntimeSection
    {
        [DataMember(Name = "displayOrder")] public int DisplayOrder { get; set; }
        [DataMember(Name = "fields")] public List<RuntimeField> Fields { get; set; }
    }

    [DataContract]
    internal sealed class RuntimeField
    {
        [DataMember(Name = "schemaName")] public string SchemaName { get; set; }
        [DataMember(Name = "label")] public string Label { get; set; }
        [DataMember(Name = "displayOrder")] public int DisplayOrder { get; set; }
        [DataMember(Name = "fieldType")] public string FieldType { get; set; }
        [DataMember(Name = "radioRenderStyle")] public string RadioRenderStyle { get; set; }
        [DataMember(Name = "options")] public List<RuntimeOption> Options { get; set; }
    }

    [DataContract]
    internal sealed class RuntimeOption
    {
        [DataMember(Name = "value")] public string Value { get; set; }
        [DataMember(Name = "label")] public string Label { get; set; }
    }
}
