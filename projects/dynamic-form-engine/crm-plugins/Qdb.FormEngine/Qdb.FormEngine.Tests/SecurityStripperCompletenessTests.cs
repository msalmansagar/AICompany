using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Moq;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// SecurityStripper rebuilds the root model property by property, so any property it was
    /// not taught about is silently dropped from the published JSON.
    ///
    /// That is not hypothetical: the form icon and the header/footer bands were added to the
    /// generator, published correctly by it, and then erased here. Everything downstream —
    /// unit tests of the generator included — passed, because the generator really did set
    /// them. Only reading the JSON the org actually serves showed they were gone.
    ///
    /// This walks every root property by reflection so the next one cannot be forgotten.
    /// </summary>
    public sealed class SecurityStripperCompletenessTests
    {
        /// <summary>Properties the stripper is meant to rewrite rather than copy.</summary>
        private static readonly HashSet<string> DeliberatelyRewritten =
            new HashSet<string> { "Tabs" };

        [Fact]
        public void Strip_PreservesEveryRootProperty()
        {
            var source = BuildFullyPopulatedModel();
            var collector = new Mock<IFieldReferenceCollector>();
            collector
                .Setup(c => c.CollectReferencedSchemaNames(It.IsAny<FormDefinitionModel>()))
                .Returns(new HashSet<string>());

            var stripped = new SecurityStripper(collector.Object).Strip(source);

            var dropped = new List<string>();
            foreach (var property in typeof(FormDefinitionModel).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (DeliberatelyRewritten.Contains(property.Name)) continue;

                var before = property.GetValue(source);
                var after = property.GetValue(stripped);
                if (!Equals(before, after)) dropped.Add(property.Name);
            }

            Assert.True(dropped.Count == 0,
                "SecurityStripper.Strip dropped root properties: " + string.Join(", ", dropped)
                + ". Add them to the object initialiser in Strip().");
        }

        /// <summary>
        /// Every root property set to a distinguishable non-default value, so "copied" and
        /// "silently dropped" cannot look the same.
        /// </summary>
        private static FormDefinitionModel BuildFullyPopulatedModel()
        {
            var model = new FormDefinitionModel();

            foreach (var property in typeof(FormDefinitionModel).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (!property.CanWrite) continue;
                var value = SampleValueFor(property.PropertyType);
                if (value != null) property.SetValue(model, value);
            }

            // Tabs is rewritten rather than copied, and an empty list keeps the walk cheap.
            model.Tabs = new List<TabDefinition>();
            return model;
        }

        private static object SampleValueFor(Type type)
        {
            var underlying = Nullable.GetUnderlyingType(type) ?? type;

            if (underlying == typeof(string)) return "sample";
            if (underlying == typeof(int)) return 7;
            if (underlying == typeof(bool)) return true;
            if (underlying == typeof(Guid)) return Guid.NewGuid();
            if (underlying == typeof(DateTime)) return new DateTime(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

            // Reference types are compared by identity, so one shared instance is enough to
            // tell "copied across" from "left null".
            if (!underlying.IsValueType && underlying.GetConstructor(Type.EmptyTypes) != null)
            {
                return Activator.CreateInstance(underlying);
            }
            return null;
        }
    }
}
