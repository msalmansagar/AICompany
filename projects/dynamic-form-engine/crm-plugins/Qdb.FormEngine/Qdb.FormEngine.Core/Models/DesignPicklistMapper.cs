namespace Qdb.FormEngine.Core.Models
{
    /// <summary>
    /// Maps design option-set integer codes to the string enums the runtimes expect.
    /// Mirrors the cloud DesignPicklistMappers.ts one-for-one (same codes, same defaults)
    /// so on-prem cache styling is identical to the cloud's live design merge.
    /// </summary>
    public static class DesignPicklistMapper
    {
        /// <summary>Maps qdb_button_type codes (also used as the buttonDesigns dictionary key).</summary>
        public static string ToButtonType(int? value)
        {
            switch (value)
            {
                case 100000001: return "Submit";
                case 100000002: return "SaveDraft";
                case 100000003: return "Cancel";
                default: return "Submit";
            }
        }

        /// <summary>Maps qdb_layout_type codes.</summary>
        public static string ToLayoutType(int? value)
        {
            switch (value)
            {
                case 100000001: return "SingleColumn";
                case 100000002: return "TwoColumn";
                case 100000003: return "Grid";
                case 100000004: return "Stepper";
                case 100000005: return "Wizard";
                case 100000006: return "Accordion";
                case 100000007: return "TabBased";
                case 100000008: return "InlineCompact";
                default: return "SingleColumn";
            }
        }

        /// <summary>Maps qdb_label_position codes.</summary>
        public static string ToLabelPosition(int? value)
        {
            switch (value)
            {
                case 100000001: return "Top";
                case 100000002: return "Left";
                case 100000003: return "Floating";
                default: return "Top";
            }
        }

        /// <summary>Maps qdb_section_style codes.</summary>
        public static string ToSectionStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "Card";
                case 100000002: return "Flat";
                case 100000003: return "Outlined";
                default: return "Card";
            }
        }

        /// <summary>Maps qdb_tab_style codes.</summary>
        public static string ToTabStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "Tabs";
                case 100000002: return "Stepper";
                case 100000003: return "Accordion";
                case 100000004: return "Sidebar";
                default: return "Tabs";
            }
        }

        /// <summary>Maps qdb_button_style codes.</summary>
        public static string ToButtonStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "Primary";
                case 100000002: return "Outline";
                case 100000003: return "Text";
                default: return "Primary";
            }
        }

        /// <summary>Maps qdb_input_style codes.</summary>
        public static string ToInputStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "Outlined";
                case 100000002: return "Filled";
                case 100000003: return "Standard";
                default: return "Outlined";
            }
        }

        /// <summary>Maps qdb_width codes for field width.</summary>
        public static string ToFieldWidth(int? value)
        {
            switch (value)
            {
                case 100000001: return "Full";
                case 100000002: return "Half";
                case 100000003: return "Custom";
                default: return "Full";
            }
        }

        /// <summary>Maps qdb_size codes for button size.</summary>
        public static string ToButtonSize(int? value)
        {
            switch (value)
            {
                case 100000001: return "Small";
                case 100000002: return "Medium";
                case 100000003: return "Large";
                default: return "Medium";
            }
        }

        /// <summary>Maps qdb_collapsible_style codes.</summary>
        public static string ToCollapseStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "None";
                case 100000002: return "Animated";
                case 100000003: return "Instant";
                default: return "None";
            }
        }

        /// <summary>Maps qdb_visibility_animation codes.</summary>
        public static string ToAnimationStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "None";
                case 100000002: return "Fade";
                case 100000003: return "Slide";
                default: return "None";
            }
        }

        /// <summary>Maps qdb_hover_effect codes.</summary>
        public static string ToHoverEffect(int? value)
        {
            switch (value)
            {
                case 100000001: return "None";
                case 100000002: return "Elevate";
                case 100000003: return "ColorShift";
                default: return "None";
            }
        }

        /// <summary>Maps qdb_loading_style codes.</summary>
        public static string ToLoadingStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "Spinner";
                case 100000002: return "Dots";
                case 100000003: return "Pulse";
                default: return "Spinner";
            }
        }

        /// <summary>Maps qdb_shadow_style codes.</summary>
        public static string ToShadowStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "None";
                case 100000002: return "Subtle";
                case 100000003: return "Strong";
                default: return "None";
            }
        }

        /// <summary>Maps qdb_spacing_scale codes.</summary>
        public static string ToSpacingScale(int? value)
        {
            switch (value)
            {
                case 100000001: return "Compact";
                case 100000002: return "Normal";
                case 100000003: return "Comfortable";
                default: return "Normal";
            }
        }

        /// <summary>Maps qdb_alignment codes.</summary>
        public static string ToAlignment(int? value)
        {
            switch (value)
            {
                case 100000001: return "Left";
                case 100000002: return "Center";
                case 100000003: return "Right";
                default: return "Left";
            }
        }

        /// <summary>Maps qdb_card_style codes.</summary>
        public static string ToCardStyle(int? value)
        {
            switch (value)
            {
                case 100000001: return "Flat";
                case 100000002: return "Elevated";
                case 100000003: return "Outlined";
                default: return "Flat";
            }
        }

        /// <summary>Maps qdb_column_layout codes to an integer column count.</summary>
        public static int ToColumnLayout(int? value)
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
    }
}
