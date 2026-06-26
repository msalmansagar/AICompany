using System;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// Unit tests for <see cref="TranslationResolver"/>.
    /// </summary>
    public sealed class TranslationResolverTests
    {
        private readonly TranslationResolver _resolver;

        /// <summary>Initialises the system under test.</summary>
        public TranslationResolverTests()
        {
            _resolver = new TranslationResolver();
        }

        [Fact]
        public void Resolve_KeyExists_ReturnsTranslatedValue()
        {
            // Arrange
            var entityName = "qdb_form_field";
            var recordId = Guid.NewGuid();
            const string fieldName = "qdb_label";
            const string translatedValue = "Translated Label";
            const string fallback = "English Label";

            var map = new TranslationMap();
            map.Add(entityName, recordId, fieldName, translatedValue);

            // Act
            var result = _resolver.Resolve(map, entityName, recordId, fieldName, fallback);

            // Assert
            Assert.Equal(translatedValue, result);
        }

        [Fact]
        public void Resolve_KeyMissing_ReturnsFallback()
        {
            // Arrange
            var map = new TranslationMap();
            const string fallback = "English Label";

            // Act
            var result = _resolver.Resolve(map, "qdb_form_field", Guid.NewGuid(), "qdb_label", fallback);

            // Assert
            Assert.Equal(fallback, result);
        }

        [Fact]
        public void Resolve_EmptyMap_ReturnsFallback()
        {
            // Arrange
            var map = new TranslationMap();
            const string fallback = "English Value";

            // Act
            var result = _resolver.Resolve(map, "qdb_form_definition", Guid.NewGuid(), "qdb_title", fallback);

            // Assert
            Assert.Equal(fallback, result);
        }

        [Fact]
        public void Resolve_NullMap_ReturnsFallback()
        {
            // Arrange
            const string fallback = "Fallback Value";

            // Act
            var result = _resolver.Resolve(null, "qdb_form_field", Guid.NewGuid(), "qdb_label", fallback);

            // Assert
            Assert.Equal(fallback, result);
        }
    }
}
