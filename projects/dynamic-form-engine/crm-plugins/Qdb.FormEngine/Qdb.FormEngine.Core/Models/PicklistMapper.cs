namespace Qdb.FormEngine.Core.Models
{
    /// <summary>
    /// Maps CRM picklist integer codes to their string representations
    /// used in the rendered form JSON. All mappings are centralised here
    /// so that any change to picklist values has a single update point.
    /// </summary>
    public static class PicklistMapper
    {
        /// <summary>Maps qdb_field_type option set values to field type strings.</summary>
        public static string ToFieldType(int? value)
        {
            switch (value)
            {
                case 100000001: return "text";
                case 100000002: return "textarea";
                case 100000003: return "number";
                case 100000004: return "date";
                case 100000005: return "datetime";
                case 100000006: return "dropdown";
                case 100000007: return "multiselect";
                case 100000008: return "lookup";
                case 100000009: return "checkbox";
                case 100000010: return "radio";
                case 100000011: return "currency";
                case 100000012: return "decimal";
                case 100000013: return "email";
                case 100000014: return "phone";
                case 100000015: return "file";
                case 100000016: return "repeatingGrid";
                case 100000017: return "richText";
                case 100000018: return "custom";
                case 100000019: return "boolean";
                case 100000020: return "info-card";
                case 100000021: return "interactive-grid";
                case 100000022: return "label";
                case 100000023: return "multiLookup";
                default: return "text";
            }
        }

        /// <summary>Maps qdb_summary_mode option set values. Returns null when unset so the
        /// generator omits it (legacy forms derive from qdb_show_summary_step at runtime).</summary>
        public static string ToSummaryMode(int? value)
        {
            switch (value)
            {
                case 100000001: return "None";
                case 100000002: return "SystemGenerated";
                case 100000003: return "Manual";
                default: return null;
            }
        }

        /// <summary>Maps qdb_bool_render_style option set values.</summary>
        public static string ToBoolRenderStyle(int? value)
        {
            return value == 100000001 ? "radio" : "toggle";
        }

        /// <summary>Maps qdb_multiselect_render_style option set values.</summary>
        public static string ToMultiselectRenderStyle(int? value)
        {
            return value == 100000001 ? "checkboxes" : "dropdown";
        }

        /// <summary>Maps qdb_radio_render_style option set values.</summary>
        public static string ToRadioRenderStyle(int? value)
        {
            return value == 100000001 ? "cards" : "list";
        }

        /// <summary>Maps qdb_info_card_style option set values.</summary>
        public static string ToInfoCardStyle(int? value)
        {
            switch (value)
            {
                case 100000000: return "info";
                case 100000001: return "warning";
                case 100000002: return "success";
                case 100000003: return "error";
                default: return null; // DFE: unset → omitted (runtime defaults to 'info' visually)
            }
        }

        /// <summary>Maps qdb_grid_mode option set values.</summary>
        public static string ToGridMode(int? value)
        {
            return value == 100000001 ? "entry" : "selection";
        }

        /// <summary>Maps qdb_grid_selection_mode option set values.</summary>
        public static string ToSelectionMode(int? value)
        {
            return value == 100000001 ? "multi" : "single";
        }

        /// <summary>Maps qdb_status option set values.</summary>
        public static string ToFormStatus(int? value)
        {
            switch (value)
            {
                case 100000000: return "draft";
                case 100000001: return "active";
                case 100000002: return "inactive";
                case 100000003: return "archived";
                default: return "draft";
            }
        }

        /// <summary>Maps qdb_action option set values for form buttons.</summary>
        public static string ToButtonAction(int? value)
        {
            switch (value)
            {
                case 100000001: return "submit";
                case 100000002: return "saveDraft";
                case 100000003: return "cancel";
                case 100000004: return "reset";
                default: return "submit";
            }
        }

        /// <summary>Maps logical operator option set values.</summary>
        public static string ToLogicalOperator(int? value)
        {
            return value == 100000001 ? "OR" : "AND";
        }

        /// <summary>Maps column/column-span option set values to integer counts.</summary>
        public static int ToColumnCount(int? value)
        {
            switch (value)
            {
                case 100000001: return 1;
                case 100000002: return 2;
                case 100000003: return 3;
                case 100000004: return 4;
                default: return 1;
            }
        }

        /// <summary>Maps qdb_rule_type option set values for validation rules.</summary>
        public static string ToValidationRuleType(int? value)
        {
            switch (value)
            {
                case 100000001: return "required";
                case 100000002: return "minLength";
                case 100000003: return "maxLength";
                case 100000004: return "minValue";
                case 100000005: return "maxValue";
                case 100000006: return "regex";
                case 100000007: return "email";
                case 100000008: return "phone";
                case 100000009: return "dateBefore";
                case 100000010: return "dateAfter";
                case 100000011: return "crossField";
                case 100000012: return "customExpression";
                default: return "required";
            }
        }

        /// <summary>Maps qdb_section_type option set values for info-card sections.</summary>
        public static string ToInfoCardSectionType(int? value)
        {
            switch (value)
            {
                case 100000000: return "numbered-steps";
                case 100000001: return "icon-list";
                case 100000002: return "download-list";
                default: return "numbered-steps";
            }
        }

        /// <summary>Maps qdb_action option set values for business rules.</summary>
        public static string ToBusinessRuleAction(int? value)
        {
            switch (value)
            {
                case 100000001: return "showField";
                case 100000002: return "hideField";
                case 100000003: return "showSection";
                case 100000004: return "hideSection";
                case 100000005: return "showTab";
                case 100000006: return "hideTab";
                case 100000007: return "makeRequired";
                case 100000008: return "makeOptional";
                case 100000009: return "makeReadonly";
                case 100000010: return "makeEditable";
                case 100000011: return "setValue";
                case 100000012: return "clearValue";
                case 100000013: return "calculateValue";
                case 100000014: return "filterOptions";
                case 100000015: return "filterLookup";
                default: return "showField";
            }
        }
    }
}
