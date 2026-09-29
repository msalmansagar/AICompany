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
    /// DFE-RULES-002 (enhancement half). The designer's calculate_value and disable_options
    /// actions must survive publishing, and the qdb_rule_json column the designer writes for
    /// conditional-required and cross-field rules must be read: for months it was written by
    /// the designer and ignored by this publisher, so those rules never reached a form.
    /// </summary>
    public sealed class RulesBatch2Tests
    {
        private const string TriggerCode = "qdb_quantity";
        private const string TargetCode = "qdb_total";
        private static readonly Guid SectionId = Guid.NewGuid();
        private static readonly Guid TabId = Guid.NewGuid();

        [Fact]
        public void Generate_PublishesCalculateValue_WithItsExpression()
        {
            var rule = SingleBusinessRule(BuildRuleJson("calculate_value", "{" + TriggerCode + "} * 1.1"));

            Assert.Equal("calculateValue", rule.Action);
            Assert.Equal("{" + TriggerCode + "} * 1.1", rule.ActionValue);
            Assert.NotNull(rule.TargetFieldId);
        }

        [Fact]
        public void Generate_PublishesDisableOptions_WithTheOptionList()
        {
            var rule = SingleBusinessRule(BuildRuleJson("disable_options", "[\\\"gold\\\",\\\"platinum\\\"]"));

            Assert.Equal("disableOptions", rule.Action);
            Assert.Equal("[\"gold\",\"platinum\"]", rule.ActionValue);
        }

        [Fact]
        public void Generate_ReadsTheCrossFieldOperatorAndTarget()
        {
            var rule = SingleValidationRule(
                "{\"schemaVersion\":2,\"type\":\"cross_field\",\"operator\":\">=\",\"targetFieldRef\":\"" + TriggerCode + "\"}");

            Assert.Equal(">=", rule.CrossFieldOperator);
            Assert.Equal(TriggerCode, rule.CrossFieldTargetRef);
        }

        [Fact]
        public void Generate_CarriesARelativeDateTargetVerbatim()
        {
            var rule = SingleValidationRule(
                "{\"schemaVersion\":2,\"type\":\"cross_field\",\"operator\":\"<=\",\"targetFieldRef\":\"@monthEnd+10y\"}");

            Assert.Equal("@monthEnd+10y", rule.CrossFieldTargetRef);
        }

        [Fact]
        public void Generate_ReadsConditionalRequiredConditions()
        {
            var rule = SingleValidationRule(
                "{\"schemaVersion\":2,\"type\":\"conditional_required\",\"conditions\":"
                + "[{\"fieldRef\":\"" + TriggerCode + "\",\"operator\":\"equals\",\"value\":\"5\"}]}");

            var condition = Assert.Single(rule.Conditions);
            Assert.Equal(TriggerCode, condition.FieldRef);
            Assert.Equal("equals", condition.Operator);
            Assert.Equal("5", condition.Value);
        }

        [Fact]
        public void Generate_LeavesALegacyRuleWithoutStructuredFields()
        {
            var rule = SingleValidationRule(null);

            Assert.Null(rule.Conditions);
            Assert.Null(rule.CrossFieldOperator);
            Assert.Null(rule.CrossFieldTargetRef);
        }

        [Fact]
        public void Generate_IgnoresACorruptPayload()
        {
            var rule = SingleValidationRule("{not json");

            Assert.Null(rule.CrossFieldOperator);
        }

        [Fact]
        public void Generate_IgnoresAnUnsupportedSchemaVersion()
        {
            var rule = SingleValidationRule("{\"schemaVersion\":1,\"type\":\"cross_field\",\"operator\":\">=\",\"targetFieldRef\":\"x\"}");

            Assert.Null(rule.CrossFieldOperator);
        }

        private static string BuildRuleJson(string actionType, string value)
        {
            return "{\"version\":\"1.0\",\"trigger_field_code\":\"" + TriggerCode + "\",\"trigger_event\":\"on_change\","
                + "\"condition_group\":{\"logical_operator\":\"AND\",\"conditions\":"
                + "[{\"field_code\":\"" + TriggerCode + "\",\"operator\":\"is_not_empty\",\"value\":null}]},"
                + "\"actions\":[{\"action_type\":\"" + actionType + "\",\"target_field_code\":\"" + TargetCode + "\",\"value\":\"" + value + "\"}]}";
        }

        private static BusinessRule SingleBusinessRule(string ruleJson)
        {
            var fields = Generate(ruleJson, null);
            return Assert.Single(fields.SelectMany(f => f.BusinessRules ?? new List<BusinessRule>()));
        }

        private static ValidationRule SingleValidationRule(string validationRuleJson)
        {
            var fields = Generate(null, validationRuleJson);
            return Assert.Single(fields.SelectMany(f => f.ValidationRules ?? new List<ValidationRule>()));
        }

        private static List<FieldDefinition> Generate(string businessRuleJson, string validationRuleJson)
        {
            var translationResolver = new Mock<ITranslationResolver>();
            translationResolver
                .Setup(r => r.Resolve(It.IsAny<TranslationMap>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
                .Returns((TranslationMap map, string entityName, Guid id, string field, string fallback) => fallback);
            var generator = new FormJsonGenerator(translationResolver.Object, new Mock<ITracingService>().Object);

            var result = generator.Generate(BuildForm(businessRuleJson, validationRuleJson), "en");

            return result.Tabs.SelectMany(t => t.Sections).SelectMany(s => s.Fields).ToList();
        }

        private static FormRawData BuildForm(string businessRuleJson, string validationRuleJson)
        {
            var formId = Guid.NewGuid();
            var formEntity = new Entity("qdb_form_definition", formId);
            formEntity["qdb_form_code"] = "RULES-BATCH-2";
            formEntity["qdb_title"] = "Rules Batch 2";
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

            var triggerField = BuildField(TriggerCode, "Quantity", 1);
            var targetField = BuildField(TargetCode, "Total", 2);

            var businessRules = new List<Entity>();
            if (businessRuleJson != null)
            {
                var ruleEntity = new Entity("qdb_form_business_rule", Guid.NewGuid());
                ruleEntity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formId);
                ruleEntity["qdb_name"] = "Batch 2 rule";
                ruleEntity["qdb_conditions_json"] = businessRuleJson;
                ruleEntity["qdb_priority"] = 1;
                ruleEntity["qdb_is_active"] = true;
                businessRules.Add(ruleEntity);
            }

            var validationEntity = new Entity("qdb_form_validation_rule", Guid.NewGuid());
            validationEntity["qdb_form_field_id"] = new EntityReference("qdb_form_field", targetField.Id);
            validationEntity["qdb_rule_type"] = new OptionSetValue(100000011);
            validationEntity["qdb_error_message"] = "Out of range";
            validationEntity["qdb_priority"] = 1;
            validationEntity["qdb_is_active"] = true;
            if (validationRuleJson != null) validationEntity["qdb_rule_json"] = validationRuleJson;

            return new FormRawData
            {
                FormEntity = formEntity,
                Tabs = new List<Entity> { tabEntity },
                Sections = new List<Entity> { sectionEntity },
                Fields = new List<Entity> { triggerField, targetField },
                OptionValues = new List<Entity>(),
                ValidationRules = new List<Entity> { validationEntity },
                LookupConfigs = new List<Entity>(),
                SubmissionMappings = new List<Entity>(),
                Buttons = new List<Entity>(),
                BusinessRules = businessRules,
                GridColumnConfigs = new List<Entity>(),
                InfoCardScreens = new List<Entity>(),
                InfoCardSections = new List<Entity>(),
                InfoCardItems = new List<Entity>(),
                TranslationMap = new TranslationMap(),
                Languages = new List<Entity>()
            };
        }

        private static Entity BuildField(string schemaName, string label, int order)
        {
            var fieldEntity = new Entity("qdb_form_field", Guid.NewGuid());
            fieldEntity["qdb_form_section_id"] = new EntityReference("qdb_form_section", SectionId);
            fieldEntity["qdb_field_type"] = new OptionSetValue(100000001);
            fieldEntity["qdb_schema_name"] = schemaName;
            fieldEntity["qdb_label"] = label;
            fieldEntity["qdb_display_order"] = order;
            fieldEntity["qdb_column_span"] = new OptionSetValue(100000001);
            return fieldEntity;
        }
    }
}
