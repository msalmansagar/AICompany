using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Moq;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// The form itself carried no mark — tabs and sections had qdb_icon_name, the form did not.
    /// These assert the generator publishes the mark, and refuses a URL it must not put in an
    /// img src: the value comes from a maker with designer access and reaches every user of
    /// the form.
    /// </summary>
    public sealed class FormIconTests
    {
        private readonly FormJsonGenerator _generator;

        public FormIconTests()
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);

            _generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);
        }

        [Fact]
        public void Generate_PublishesIconName()
        {
            var result = _generator.Generate(BuildForm(f => f["qdb_icon_name"] = "DocumentBulletList"), "en");

            Assert.Equal("DocumentBulletList", result.IconName);
        }

        [Fact]
        public void Generate_PublishesAnHttpsImageUrl()
        {
            var result = _generator.Generate(BuildForm(f => f["qdb_image_url"] = "https://example.com/logo.png"), "en");

            Assert.Equal("https://example.com/logo.png", result.ImageUrl);
        }

        [Theory]
        [InlineData("javascript:alert(1)")]
        [InlineData("data:image/svg+xml;base64,PHN2Zy8+")]
        [InlineData("/relative/logo.png")]
        [InlineData("not a url at all")]
        public void Generate_RefusesAnUnrenderableImageUrl(string url)
        {
            var result = _generator.Generate(BuildForm(f => f["qdb_image_url"] = url), "en");

            Assert.Null(result.ImageUrl);
        }

        /// <summary>Blank must publish as null so the JSON omits the property entirely.</summary>
        [Fact]
        public void Generate_OmitsBothMarks_WhenNeitherIsSet()
        {
            var result = _generator.Generate(BuildForm(f => { }), "en");

            Assert.Null(result.IconName);
            Assert.Null(result.ImageUrl);
        }

        [Fact]
        public void Generate_TreatsAWhitespaceIconAsUnset()
        {
            var result = _generator.Generate(BuildForm(f => f["qdb_icon_name"] = "   "), "en");

            Assert.Null(result.IconName);
        }

        private static FormRawData BuildForm(Action<Entity> configure)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "FORM-ICON-001";
            formEntity["qdb_title"] = "Icon Form";
            formEntity["qdb_version"] = 1;
            formEntity["qdb_status"] = new OptionSetValue(100000001);
            configure(formEntity);

            return new FormRawData
            {
                FormEntity = formEntity,
                Tabs = new List<Entity>(),
                Sections = new List<Entity>(),
                Fields = new List<Entity>(),
                OptionValues = new List<Entity>(),
                ValidationRules = new List<Entity>(),
                LookupConfigs = new List<Entity>(),
                SubmissionMappings = new List<Entity>(),
                Buttons = new List<Entity>(),
                BusinessRules = new List<Entity>(),
                GridColumnConfigs = new List<Entity>(),
                InfoCardScreens = new List<Entity>(),
                InfoCardSections = new List<Entity>(),
                InfoCardItems = new List<Entity>(),
                TranslationMap = new TranslationMap(),
                Languages = new List<Entity>()
            };
        }
    }
}
