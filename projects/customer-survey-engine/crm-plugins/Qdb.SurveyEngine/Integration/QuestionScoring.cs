using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// How one question of a weighted survey scores an answer (Addendum A, FR-CSE-062..065): a single
    /// choice scores its option's points, a multi-choice the sum of the chosen options' points, and a
    /// number question its value capped to the configured minimum and maximum. The weight multiplies
    /// both the points and the maximum. A question that cannot score (weight 0, no points, text)
    /// answers no score, so it counts neither towards the total nor the maximum.
    /// </summary>
    public sealed class QuestionScoring
    {
        private const char MultiValueSeparator = ',';
        private static readonly HashSet<string> NumberTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "number", "decimal", "currency" };
        private readonly decimal _weight;
        private readonly ScoringKind _kind;
        private readonly IReadOnlyDictionary<string, decimal> _optionPoints;
        private readonly decimal? _min;
        private readonly decimal? _max;

        private QuestionScoring(decimal weight, ScoringKind kind, IReadOnlyDictionary<string, decimal> optionPoints, decimal? min, decimal? max)
        {
            _weight = weight;
            _kind = kind;
            _optionPoints = optionPoints;
            _min = min;
            _max = max;
        }

        /// <summary>The scoring of a published field, or null when the question is not scored.</summary>
        internal static QuestionScoring For(RuntimeField field)
        {
            var weight = field.ScoreWeight ?? 1m;
            if (weight <= 0) return null;
            if (NumberTypes.Contains(field.FieldType ?? string.Empty))
                return field.ScoreMin.HasValue && field.ScoreMax.HasValue && field.ScoreMin < field.ScoreMax
                    ? new QuestionScoring(weight, ScoringKind.Number, null, field.ScoreMin, field.ScoreMax) : null;
            var points = OptionPoints(field);
            if (points.Count == 0) return null;
            var kind = string.Equals(field.FieldType, "multi_select", StringComparison.OrdinalIgnoreCase) ? ScoringKind.MultiChoice : ScoringKind.Choice;
            return new QuestionScoring(weight, kind, points, null, null);
        }

        // Points set on the option win; a rating option without points scores its own number (FR-CSE-062).
        private static IReadOnlyDictionary<string, decimal> OptionPoints(RuntimeField field)
        {
            var isRating = string.Equals(field.RadioRenderStyle, "rating", StringComparison.OrdinalIgnoreCase);
            var points = new Dictionary<string, decimal>(StringComparer.Ordinal);
            foreach (var option in field.Options ?? new List<RuntimeOption>())
            {
                if (option.Value == null) continue;
                if (option.ScorePoints.HasValue) points[option.Value] = option.ScorePoints.Value;
                else if (isRating && decimal.TryParse(option.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var own)) points[option.Value] = own;
            }
            return points;
        }

        /// <summary>The answer's points, or null when the value cannot be scored (e.g. an option without points).</summary>
        public AnswerScore Score(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            switch (_kind)
            {
                case ScoringKind.Number: return ScoreNumber(value);
                case ScoringKind.MultiChoice: return ScoreMultiChoice(value);
                default: return _optionPoints.TryGetValue(value.Trim(), out var points) ? Weighted(points, _optionPoints.Values.Max()) : null;
            }
        }

        private AnswerScore ScoreNumber(string value)
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number)) return null;
            return Weighted(Math.Min(Math.Max(number, _min.Value), _max.Value), _max.Value);
        }

        private AnswerScore ScoreMultiChoice(string value)
        {
            var chosen = value.Split(MultiValueSeparator).Select(part => part.Trim()).Where(part => part.Length > 0).ToList();
            if (chosen.Any(part => !_optionPoints.ContainsKey(part))) return null;
            return Weighted(chosen.Sum(part => _optionPoints[part]), _optionPoints.Values.Where(points => points > 0).Sum());
        }

        private AnswerScore Weighted(decimal points, decimal maximum) => new AnswerScore(points, points * _weight, maximum * _weight);

        private enum ScoringKind
        {
            Choice,
            MultiChoice,
            Number,
        }
    }

    /// <summary>One answer's score: its points, the weighted points and the weighted maximum it could have scored.</summary>
    public sealed class AnswerScore
    {
        public AnswerScore(decimal points, decimal weightedPoints, decimal weightedMaximum)
        {
            Points = points;
            WeightedPoints = weightedPoints;
            WeightedMaximum = weightedMaximum;
        }

        public decimal Points { get; }
        public decimal WeightedPoints { get; }
        public decimal WeightedMaximum { get; }
    }
}
