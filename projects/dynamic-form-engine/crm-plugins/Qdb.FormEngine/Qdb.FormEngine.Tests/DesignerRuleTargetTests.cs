using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Moq;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Models;
using Xunit;

namespace Qdb.FormEngine.Tests
{
    /// <summary>
    /// A designer-authored rule aimed at a tab used to publish as a rule aimed at nothing:
    /// AppendDesignerRules resolved every action's target as a field schema code and set only
    /// TargetFieldId, so showTab/hideTab lost the tab entirely. There is one such rule in the
    /// org today and it does nothing.
    /// </summary>
    public sealed class DesignerRuleTargetTests
    {
        private const string TriggerCode = "qdb_applicant_type";
        private static readonly Guid TabId = Guid.NewGuid();
        private static readonly Guid SectionId = Guid.NewGuid();

        [Fact]
        public void Generate_CarriesTheTabTarget_ForAHideTabAction()
        {
            var rule = SingleRule(BuildRuleJson("hide_tab", "\"target_tab_id\":\"" + TabId + "\""));

            Assert.Equal("hideTab", rule.Action);
            Assert.Equal(TabId, rule.TargetTabId);
        }

        [Fact]
        public void Generate_CarriesTheSectionTarget_ForAHideSectionAction()
        {
            var rule = SingleRule(BuildRuleJson("hide_section", "\"target_section_id\":\"" + SectionId + "\""));

            Assert.Equal("hideSection", rule.Action);
            Assert.Equal(SectionId, rule.TargetSectionId);
        }

        [Fact]
        public void Generate_LeavesTheFieldTargetUnset_ForATabAction()
        {
            var rule = SingleRule(BuildRuleJson("hide_tab", "\"target_tab_id\":\"" + TabId + "\""));

            Assert.Null(rule.TargetFieldId);
        }

        [Fact]
        public void Generate_StillResolvesFieldActionsByCode()
        {
            var rule = SingleRule(BuildRuleJson("hide_field", "\"target_field_code\":\"" + TriggerCode + "\""));

            Assert.Equal("hideField", rule.Action);
            Assert.NotNull(rule.TargetFieldId);
        }

        /// <summary>
        /// An action naming no usable target cannot be applied to anything, so it is dropped
        /// rather than published as a rule that silently does nothing.
        /// </summary>
        [Fact]
        public void Generate_DropsATabAction_WithNoTabId()
        {
            var rules = BuildRules(BuildRuleJson("hide_tab", "\"target_tab_id\":\"\""));

            Assert.Empty(rules);
        }

        [Fact]
        public void Generate_DropsATabAction_WithAMalformedTabId()
        {
            var rules = BuildRules(BuildRuleJson("hide_tab", "\"target_tab_id\":\"not-a-guid\""));

            Assert.Empty(rules);
        }

        private static string BuildRuleJson(string actionType, string targetJson)
        {
            return "{\"version\":\"1.0\",\"trigger_field_code\":\"" + TriggerCode + "\","
                + "\"trigger_event\":\"on_change\","
                + "\"condition_group\":{\"logical_operator\":\"AND\",\"conditions\":"
                + "[{\"field_code\":\"" + TriggerCode + "\",\"operator\":\"equals\",\"value\":\"individual\"}]},"
                + "\"actions\":[{\"action_type\":\"" + actionType + "\"," + targetJson + "}]}";
        }

        private static BusinessRule SingleRule(string ruleJson)
        {
            return Assert.Single(BuildRules(ruleJson));
        }

        private static List<BusinessRule> BuildRules(string ruleJson)
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);
            var generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);

            var result = generator.Generate(BuildForm(ruleJson), "en");

            return result.Tabs
                .SelectMany(t => t.Sections)
                .SelectMany(s => s.Fields)
                .SelectMany(f => f.BusinessRules ?? new List<BusinessRule>())
                .ToList();
        }

        private static FormRawData BuildForm(string ruleJson)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "RULE-TARGET-001";
            formEntity["qdb_title"] = "Rule Target Form";
            formEntity["qdb_version"] = 1;
            formEntity["qdb_status"] = new OptionSetValue(100000001);

            var tabEntity = new Entity("qdb_form_tab", TabId);
            tabEntity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            tabEntity["qdb_label"] = "Tab One";
            tabEntity["qdb_display_order"] = 1;
            tabEntity["qdb_is_visible"] = true;

            var sectionEntity = new Entity("qdb_form_section", SectionId);
            sectionEntity["qdb_form_tab_id"] = new EntityReference("qdb_form_tab", TabId);
            sectionEntity["qdb_label"] = "Section One";
            sectionEntity["qdb_display_order"] = 1;
            sectionEntity["qdb_columns"] = new OptionSetValue(100000001);
            sectionEntity["qdb_is_visible"] = true;

            var fieldEntity = new Entity("qdb_form_field", Guid.NewGuid());
            fieldEntity["qdb_form_section_id"] = new EntityReference("qdb_form_section", SectionId);
            fieldEntity["qdb_field_type"] = new OptionSetValue(100000001);
            fieldEntity["qdb_schema_name"] = TriggerCode;
            fieldEntity["qdb_label"] = "Applicant Type";
            fieldEntity["qdb_display_order"] = 1;
            fieldEntity["qdb_column_span"] = new OptionSetValue(100000001);

            var ruleEntity = new Entity("qdb_form_business_rule", Guid.NewGuid());
            ruleEntity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
            ruleEntity["qdb_name"] = "Hide when individual";
            ruleEntity["qdb_conditions_json"] = ruleJson;
            ruleEntity["qdb_priority"] = 1;
            ruleEntity["qdb_is_active"] = true;

            return new FormRawData
            {
                FormEntity = formEntity,
                Tabs = new List<Entity> { tabEntity },
                Sections = new List<Entity> { sectionEntity },
                Fields = new List<Entity> { fieldEntity },
                OptionValues = new List<Entity>(),
                ValidationRules = new List<Entity>(),
                LookupConfigs = new List<Entity>(),
                SubmissionMappings = new List<Entity>(),
                Buttons = new List<Entity>(),
                BusinessRules = new List<Entity> { ruleEntity },
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
