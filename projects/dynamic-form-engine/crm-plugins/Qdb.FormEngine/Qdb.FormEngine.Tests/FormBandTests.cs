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
    /// The header was fixed markup and there was no footer at all. These assert the generator
    /// publishes maker-authored bands, omits them entirely when unconfigured (so a form
    /// without bands stays byte-identical), and refuses an image URL it must not render.
    /// </summary>
    public sealed class FormBandTests
    {
        private const string HeaderTextAttribute = "qdb_header_text";
        private const string FooterTextAttribute = "qdb_footer_text";

        [Fact]
        public void Generate_OmitsBothBands_WhenNeitherIsConfigured()
        {
            var result = BuildGenerator().Generate(BuildForm(f => { }), "en");

            Assert.Null(result.Header);
            Assert.Null(result.Footer);
        }

        [Fact]
        public void Generate_PublishesHeaderText()
        {
            var result = BuildGenerator().Generate(
                BuildForm(f => f[HeaderTextAttribute] = "Applications close on 31 March."), "en");

            Assert.Equal("Applications close on 31 March.", result.Header.Text);
        }

        [Fact]
        public void Generate_PublishesFooterTextAndImage()
        {
            var result = BuildGenerator().Generate(BuildForm(f =>
            {
                f[FooterTextAttribute] = "Need help? Call 800 0000.";
                f["qdb_footer_image_url"] = "https://example.com/seal.png";
            }), "en");

            Assert.Equal("Need help? Call 800 0000.", result.Footer.Text);
            Assert.Equal("https://example.com/seal.png", result.Footer.ImageUrl);
        }

        /// <summary>An image alone is a band — the text is not required to make one.</summary>
        [Fact]
        public void Generate_PublishesABandWithOnlyAnImage()
        {
            var result = BuildGenerator().Generate(
                BuildForm(f => f["qdb_header_image_url"] = "https://example.com/banner.png"), "en");

            Assert.NotNull(result.Header);
            Assert.Null(result.Header.Text);
        }

        [Theory]
        [InlineData("javascript:alert(1)")]
        [InlineData("data:image/svg+xml;base64,PHN2Zy8+")]
        [InlineData("/relative/banner.png")]
        public void Generate_RefusesAnUnrenderableBandImage(string url)
        {
            var result = BuildGenerator().Generate(
                BuildForm(f => f["qdb_header_image_url"] = url), "en");

            Assert.Null(result.Header);
        }

        /// <summary>Band copy is maker-authored, so it translates like any other label.</summary>
        [Fact]
        public void Generate_TranslatesBandText()
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), HeaderTextAttribute, It.IsAny<string>()))
                .Returns("تغلق الطلبات في 31 مارس.");
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.Is<string>(f => f != HeaderTextAttribute), It.IsAny<string>()))
                .Returns((TranslationMap m, string e, Guid i, string f, string fallback) => fallback);
            var generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);

            var result = generator.Generate(
                BuildForm(f => f[HeaderTextAttribute] = "Applications close on 31 March."), "ar");

            Assert.Equal("تغلق الطلبات في 31 مارس.", result.Header.Text);
        }

        private static FormJsonGenerator BuildGenerator()
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);
            return new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);
        }

        private static FormRawData BuildForm(Action<Entity> configure)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "FORM-BAND-001";
            formEntity["qdb_title"] = "Band Form";
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
