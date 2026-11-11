using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Moq;
using Newtonsoft.Json;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// FR-CSE-061..069 — Weighted scoring JSON output from the C# publisher.
    ///
    /// Verifies three invariants:
    ///   1. A form without scoring columns in its entity produces byte-identical JSON
    ///      to the same form before the scoring feature shipped (NFR-CSE-010).
    ///   2. A weighted survey publishes scoringMode, scoreWeight, scoreMin, scoreMax,
    ///      and scorePoints in the runtime JSON.
    ///   3. Fields with no scoring columns set omit those properties from the JSON.
    /// </summary>
    public sealed class WeightedScoringTests
    {
        private readonly FormJsonGenerator _generator;

        public WeightedScoringTests()
        {
            var resolver = new Mock<ITranslationResolver>();
            resolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap _, string __, Guid ___, string ____, string fallback) => fallback);

            _generator = new FormJsonGenerator(resolver.Object, new Mock<ITracingService>().Object);
        }

        // ─── NFR-CSE-010: byte-identical for non-scoring forms ─────────────────

        [Fact]
        public void Generate_FormWithNoScoringColumns_OmitsScoringModeFromJson()
        {
            var rawData = BuildForm(_ => { }); // no qdb_scoring_mode on the entity

            var result = _generator.Generate(rawData, "en");
            var json = JsonConvert.SerializeObject(result);

            Assert.Null(result.ScoringMode);
            Assert.DoesNotContain("scoringMode", json);
        }

        [Fact]
        public void Generate_FormWithScoringModeNone_OmitsScoringModeFromJson()
        {
            // None (100000000) is the "off" state — must be omitted, not published as "null".
            var rawData = BuildForm(form => form["qdb_scoring_mode"] = new OptionSetValue(100000000));

            var result = _generator.Generate(rawData, "en");
            var json = JsonConvert.SerializeObject(result);

            Assert.Null(result.ScoringMode);
            Assert.DoesNotContain("scoringMode", json);
        }

        [Fact]
        public void Generate_FieldWithNoScoringColumns_OmitsScoreWeightFromJson()
        {
            var rawData = BuildFormWithField(field => { }); // no qdb_score_weight

            var result = _generator.Generate(rawData, "en");
            var json = JsonConvert.SerializeObject(result);

            var fieldDef = result.Tabs[0].Sections[0].Fields[0];
            Assert.Null(fieldDef.ScoreWeight);
            Assert.DoesNotContain("scoreWeight", json);
            Assert.DoesNotContain("scoreMin", json);
            Assert.DoesNotContain("scoreMax", json);
        }

        [Fact]
        public void Generate_OptionWithNoScoringColumn_OmitsScorePointsFromJson()
        {
            var rawData = BuildFormWithFieldAndOption(option => { }); // no qdb_score_points

            var result = _generator.Generate(rawData, "en");
            var json = JsonConvert.SerializeObject(result);

            Assert.DoesNotContain("scorePoints", json);
        }

        // ─── Weighted survey publishes all scoring properties ──────────────────

        [Fact]
        public void Generate_FormWithScoringModeWeighted_PublishesScoringModeAsWeighted()
        {
            var rawData = BuildForm(form => form["qdb_scoring_mode"] = new OptionSetValue(100000001));

            var result = _generator.Generate(rawData, "en");

            Assert.Equal("weighted", result.ScoringMode);
        }

        [Fact]
        public void Generate_FormWithAType_StillPublishesNoFormType()
        {
            // Form Type stays out of the runtime JSON: emitting it would change every survey's and every
            // explicitly-Standard form's published output (NFR-CSE-010).
            var rawData = BuildForm(form => form["qdb_form_type"] = new OptionSetValue(100000001));

            var json = Newtonsoft.Json.JsonConvert.SerializeObject(_generator.Generate(rawData, "en"));

            Assert.DoesNotContain("formType", json);
        }

        [Fact]
        public void Generate_FieldWithScoreWeight_PublishesScoreWeight()
        {
            var rawData = BuildFormWithField(field => field["qdb_score_weight"] = 2.5m);

            var result = _generator.Generate(rawData, "en");

            var fieldDef = result.Tabs[0].Sections[0].Fields[0];
            Assert.Equal(2.5m, fieldDef.ScoreWeight);
        }

        [Fact]
        public void Generate_FieldWithScoreMinAndMax_PublishesBoth()
        {
            var rawData = BuildFormWithField(field =>
            {
                field["qdb_score_min"] = -100m;
                field["qdb_score_max"] = 100m;
            });

            var result = _generator.Generate(rawData, "en");

            var fieldDef = result.Tabs[0].Sections[0].Fields[0];
            Assert.Equal(-100m, fieldDef.ScoreMin);
            Assert.Equal(100m, fieldDef.ScoreMax);
        }

        [Fact]
        public void Generate_OptionWithScorePoints_PublishesScorePoints()
        {
            var rawData = BuildFormWithFieldAndOption(row => row["qdb_score_points"] = 7.5m);

            var result = _generator.Generate(rawData, "en");

            var published = result.Tabs[0].Sections[0].Fields[0].Options[0];
            Assert.Equal(7.5m, published.ScorePoints);
        }

        [Fact]
        public void Generate_FullWeightedSurvey_PublishesAllScoringPropertiesInJson()
        {
            var rawData = BuildFormWithFieldAndOption(
                form => form["qdb_scoring_mode"] = new OptionSetValue(100000001),
                field =>
                {
                    field["qdb_score_weight"] = 1m;
                    field["qdb_score_min"] = 0m;
                    field["qdb_score_max"] = 10m;
                },
                option => option["qdb_score_points"] = 5m);

            var result = _generator.Generate(rawData, "en");
            var json = JsonConvert.SerializeObject(result);

            Assert.Equal("weighted", result.ScoringMode);
            Assert.Contains("\"scoringMode\":\"weighted\"", json);
            Assert.Contains("\"scoreWeight\":", json);
            Assert.Contains("\"scoreMin\":", json);
            Assert.Contains("\"scoreMax\":", json);
            Assert.Contains("\"scorePoints\":", json);
        }

        // ─── Partial scoring (only some columns set) ──────────────────────────

        [Fact]
        public void Generate_FieldWithOnlyScoreWeight_OmitsScoreMinAndMax()
        {
            var rawData = BuildFormWithField(field => field["qdb_score_weight"] = 3m);

            var result = _generator.Generate(rawData, "en");
            var json = JsonConvert.SerializeObject(result);

            Assert.Contains("\"scoreWeight\":", json);
            Assert.DoesNotContain("scoreMin", json);
            Assert.DoesNotContain("scoreMax", json);
        }

        // ─── Helpers ─────────────────────────────────────────────────────────

        /// <summary>Builds a FormRawData with no tabs/sections/fields — form-level tests only.</summary>
        private static FormRawData BuildForm(Action<Entity> configureForm)
        {
            var formId = Guid.NewGuid();
            var form = new Entity("qdb_form_definition", formId);
            form["qdb_form_code"] = "SCORING-TEST";
            form["qdb_title"] = "Scoring Test Form";
            form["qdb_version"] = 1;
            form["qdb_status"] = new OptionSetValue(100000001);
            configureForm(form);

            return MinimalRawData(form);
        }

        /// <summary>Builds a FormRawData with one tab, one section, and one dropdown field.</summary>
        private static FormRawData BuildFormWithField(Action<Entity> configureField)
        {
            return BuildFormWithFieldAndOption(_ => { }, configureField, _ => { });
        }

        /// <summary>Builds a FormRawData with one tab, one section, one field, and one option.</summary>
        private static FormRawData BuildFormWithFieldAndOption(
            Action<Entity> configureOption)
        {
            return BuildFormWithFieldAndOption(_ => { }, _ => { }, configureOption);
        }

        private static FormRawData BuildFormWithFieldAndOption(
            Action<Entity> configureForm,
            Action<Entity> configureField,
            Action<Entity> configureOption)
        {
            var formId = Guid.NewGuid();
            var form = new Entity("qdb_form_definition", formId);
            form["qdb_form_code"] = "SCORING-TEST";
            form["qdb_title"] = "Scoring Test Form";
            form["qdb_version"] = 1;
            form["qdb_status"] = new OptionSetValue(100000001);
            configureForm(form);

            var tabId = Guid.NewGuid();
            var tab = new Entity("qdb_form_tab", tabId);
            tab["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            tab["qdb_label"] = "Questions";
            tab["qdb_display_order"] = 0;
            tab["qdb_is_visible"] = true;

            var sectionId = Guid.NewGuid();
            var section = new Entity("qdb_form_section", sectionId);
            section["qdb_form_tab_id"] = new EntityReference("qdb_form_tab", tabId);
            section["qdb_label"] = "Q1";
            section["qdb_display_order"] = 0;
            section["qdb_is_visible"] = true;
            section["qdb_columns"] = new OptionSetValue(100000001);

            var fieldId = Guid.NewGuid();
            var field = new Entity("qdb_form_field", fieldId);
            field["qdb_form_section_id"] = new EntityReference("qdb_form_section", sectionId);
            field["qdb_label"] = "How satisfied?";
            field["qdb_code"] = "satisfaction";
            field["qdb_field_type"] = new OptionSetValue(100000006); // dropdown
            field["qdb_display_order"] = 0;
            field["qdb_is_required"] = false;
            field["qdb_is_readonly"] = false;
            field["qdb_is_hidden"] = false;
            field["qdb_column_span"] = new OptionSetValue(100000001);
            configureField(field);

            var optionId = Guid.NewGuid();
            var option = new Entity("qdb_form_option_value", optionId);
            option["qdb_form_field_id"] = new EntityReference("qdb_form_field", fieldId);
            option["qdb_label"] = "Very satisfied";
            option["qdb_value"] = "very_satisfied";
            option["qdb_display_order"] = 0;
            option["qdb_is_default"] = false;
            option["qdb_is_active"] = true;
            configureOption(option);

            var rawData = MinimalRawData(form);
            rawData.Tabs = new List<Entity> { tab };
            rawData.Sections = new List<Entity> { section };
            rawData.Fields = new List<Entity> { field };
            rawData.OptionValues = new List<Entity> { option };
            return rawData;
        }

        private static FormRawData MinimalRawData(Entity form)
        {
            return new FormRawData
            {
                FormEntity = form,
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
