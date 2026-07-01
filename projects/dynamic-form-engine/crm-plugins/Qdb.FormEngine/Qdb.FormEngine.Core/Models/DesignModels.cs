using System.Collections.Generic;
using Newtonsoft.Json;

namespace Qdb.FormEngine.Core.Models
{
    /// <summary>
    /// DFE-STYLE-001: the complete design/styling payload for a published form.
    /// Mirrors the shared DesignPayload contract (design.types.ts) consumed by the
    /// portal, mobile and in-CRM runtimes. Emitted into the render cache so on-prem
    /// delivery carries the same styling the cloud merges live.
    /// </summary>
    public sealed class DesignPayload
    {
        [JsonProperty("theme")] public ThemeDefinition Theme { get; set; }
        [JsonProperty("formDesign")] public FormDesign FormDesign { get; set; }
        [JsonProperty("sectionDesigns")] public Dictionary<string, SectionDesign> SectionDesigns { get; set; }
        [JsonProperty("fieldDesigns")] public Dictionary<string, FieldDesign> FieldDesigns { get; set; }
        [JsonProperty("buttonDesigns")] public Dictionary<string, ButtonDesign> ButtonDesigns { get; set; }
        [JsonProperty("layoutGrid")] public List<LayoutGrid> LayoutGrid { get; set; }
    }

    /// <summary>A reusable colour/typography theme applied to a form.</summary>
    public sealed class ThemeDefinition
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("themeCode")] public string ThemeCode { get; set; }
        [JsonProperty("themeName")] public string ThemeName { get; set; }
        [JsonProperty("primaryColor")] public string PrimaryColor { get; set; }
        [JsonProperty("secondaryColor", NullValueHandling = NullValueHandling.Ignore)] public string SecondaryColor { get; set; }
        [JsonProperty("backgroundColor", NullValueHandling = NullValueHandling.Ignore)] public string BackgroundColor { get; set; }
        [JsonProperty("surfaceColor", NullValueHandling = NullValueHandling.Ignore)] public string SurfaceColor { get; set; }
        [JsonProperty("textPrimaryColor", NullValueHandling = NullValueHandling.Ignore)] public string TextPrimaryColor { get; set; }
        [JsonProperty("textSecondaryColor", NullValueHandling = NullValueHandling.Ignore)] public string TextSecondaryColor { get; set; }
        [JsonProperty("borderColor", NullValueHandling = NullValueHandling.Ignore)] public string BorderColor { get; set; }
        [JsonProperty("errorColor", NullValueHandling = NullValueHandling.Ignore)] public string ErrorColor { get; set; }
        [JsonProperty("successColor", NullValueHandling = NullValueHandling.Ignore)] public string SuccessColor { get; set; }
        [JsonProperty("warningColor", NullValueHandling = NullValueHandling.Ignore)] public string WarningColor { get; set; }
        [JsonProperty("fontFamily", NullValueHandling = NullValueHandling.Ignore)] public string FontFamily { get; set; }
        [JsonProperty("fontUrl", NullValueHandling = NullValueHandling.Ignore)] public string FontUrl { get; set; }
        [JsonProperty("baseFontSize", NullValueHandling = NullValueHandling.Ignore)] public string BaseFontSize { get; set; }
        [JsonProperty("headingFontSize", NullValueHandling = NullValueHandling.Ignore)] public string HeadingFontSize { get; set; }
        [JsonProperty("labelFontSize", NullValueHandling = NullValueHandling.Ignore)] public string LabelFontSize { get; set; }
        [JsonProperty("inputFontSize", NullValueHandling = NullValueHandling.Ignore)] public string InputFontSize { get; set; }
        [JsonProperty("borderRadius", NullValueHandling = NullValueHandling.Ignore)] public string BorderRadius { get; set; }
        [JsonProperty("shadowStyle", NullValueHandling = NullValueHandling.Ignore)] public string ShadowStyle { get; set; }
        [JsonProperty("spacingScale", NullValueHandling = NullValueHandling.Ignore)] public string SpacingScale { get; set; }
        [JsonProperty("isDarkMode")] public bool IsDarkMode { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>Form-level layout and behaviour design, including scoped custom CSS.</summary>
    public sealed class FormDesign
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("formDefinitionId", NullValueHandling = NullValueHandling.Ignore)] public string FormDefinitionId { get; set; }
        [JsonProperty("themeId", NullValueHandling = NullValueHandling.Ignore)] public string ThemeId { get; set; }
        [JsonProperty("layoutType")] public string LayoutType { get; set; }
        [JsonProperty("labelPosition")] public string LabelPosition { get; set; }
        [JsonProperty("sectionStyle")] public string SectionStyle { get; set; }
        [JsonProperty("tabStyle")] public string TabStyle { get; set; }
        [JsonProperty("buttonStyle")] public string ButtonStyle { get; set; }
        [JsonProperty("animationEnabled")] public bool AnimationEnabled { get; set; }
        [JsonProperty("responsiveBehavior", NullValueHandling = NullValueHandling.Ignore)] public object ResponsiveBehavior { get; set; }
        [JsonProperty("maxWidth", NullValueHandling = NullValueHandling.Ignore)] public string MaxWidth { get; set; }
        [JsonProperty("alignment")] public string Alignment { get; set; }
        [JsonProperty("customCss", NullValueHandling = NullValueHandling.Ignore)] public string CustomCss { get; set; }
        [JsonProperty("stickyActionBar")] public bool StickyActionBar { get; set; }
        [JsonProperty("skeletonLoaderEnabled")] public bool SkeletonLoaderEnabled { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>Per-section visual design (background, spacing, custom CSS class).</summary>
    public sealed class SectionDesign
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("sectionId")] public string SectionId { get; set; }
        [JsonProperty("backgroundColor", NullValueHandling = NullValueHandling.Ignore)] public string BackgroundColor { get; set; }
        [JsonProperty("borderStyle", NullValueHandling = NullValueHandling.Ignore)] public string BorderStyle { get; set; }
        [JsonProperty("padding", NullValueHandling = NullValueHandling.Ignore)] public string Padding { get; set; }
        [JsonProperty("margin", NullValueHandling = NullValueHandling.Ignore)] public string Margin { get; set; }
        [JsonProperty("columnLayout")] public int ColumnLayout { get; set; }
        [JsonProperty("cardStyle")] public string CardStyle { get; set; }
        [JsonProperty("collapsibleStyle")] public string CollapsibleStyle { get; set; }
        [JsonProperty("headerStyle", NullValueHandling = NullValueHandling.Ignore)] public object HeaderStyle { get; set; }
        [JsonProperty("visibilityAnimation")] public string VisibilityAnimation { get; set; }
        [JsonProperty("cssClassName", NullValueHandling = NullValueHandling.Ignore)] public string CssClassName { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>Per-field visual design (input style, width, state styles, custom CSS class).</summary>
    public sealed class FieldDesign
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("fieldId")] public string FieldId { get; set; }
        [JsonProperty("labelStyle", NullValueHandling = NullValueHandling.Ignore)] public object LabelStyle { get; set; }
        [JsonProperty("inputStyle")] public string InputStyle { get; set; }
        [JsonProperty("width")] public string Width { get; set; }
        [JsonProperty("customWidth", NullValueHandling = NullValueHandling.Ignore)] public string CustomWidth { get; set; }
        [JsonProperty("height", NullValueHandling = NullValueHandling.Ignore)] public string Height { get; set; }
        [JsonProperty("placeholderStyle", NullValueHandling = NullValueHandling.Ignore)] public object PlaceholderStyle { get; set; }
        [JsonProperty("iconPrefix", NullValueHandling = NullValueHandling.Ignore)] public string IconPrefix { get; set; }
        [JsonProperty("iconSuffix", NullValueHandling = NullValueHandling.Ignore)] public string IconSuffix { get; set; }
        [JsonProperty("tooltipStyle", NullValueHandling = NullValueHandling.Ignore)] public object TooltipStyle { get; set; }
        [JsonProperty("errorStyle", NullValueHandling = NullValueHandling.Ignore)] public object ErrorStyle { get; set; }
        [JsonProperty("focusStyle", NullValueHandling = NullValueHandling.Ignore)] public object FocusStyle { get; set; }
        [JsonProperty("disabledStyle", NullValueHandling = NullValueHandling.Ignore)] public object DisabledStyle { get; set; }
        [JsonProperty("cssClassName", NullValueHandling = NullValueHandling.Ignore)] public string CssClassName { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>Per-button-type visual design (colour, size, hover and loading styles).</summary>
    public sealed class ButtonDesign
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("formDefinitionId")] public string FormDefinitionId { get; set; }
        [JsonProperty("buttonType")] public string ButtonType { get; set; }
        [JsonProperty("color", NullValueHandling = NullValueHandling.Ignore)] public string Color { get; set; }
        [JsonProperty("size")] public string Size { get; set; }
        [JsonProperty("borderRadius", NullValueHandling = NullValueHandling.Ignore)] public string BorderRadius { get; set; }
        [JsonProperty("alignment")] public string Alignment { get; set; }
        [JsonProperty("icon", NullValueHandling = NullValueHandling.Ignore)] public string Icon { get; set; }
        [JsonProperty("hoverEffect")] public string HoverEffect { get; set; }
        [JsonProperty("loadingStyle")] public string LoadingStyle { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>Responsive grid span configuration for a single field within the form design.</summary>
    public sealed class LayoutGrid
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("formDesignId")] public string FormDesignId { get; set; }
        [JsonProperty("fieldId")] public string FieldId { get; set; }
        [JsonProperty("columnsTotal")] public int ColumnsTotal { get; set; }
        [JsonProperty("spanMobile")] public int SpanMobile { get; set; }
        [JsonProperty("spanTablet")] public int SpanTablet { get; set; }
        [JsonProperty("spanDesktop")] public int SpanDesktop { get; set; }
    }
}
