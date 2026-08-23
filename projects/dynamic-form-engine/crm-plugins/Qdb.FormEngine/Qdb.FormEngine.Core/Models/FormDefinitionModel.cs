using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Qdb.FormEngine.Core.Models
{
    /// <summary>Fully materialised form definition ready for serialisation and delivery to portal clients.</summary>
    public sealed class FormDefinitionModel
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("formCode")] public string FormCode { get; set; }
        [JsonProperty("title")] public string Title { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("status")] public string Status { get; set; }
        [JsonProperty("version")] public int Version { get; set; }
        // Form-level mark shown beside the title. Both omitted when unset so a form with no
        // mark publishes byte-identical JSON.
        [JsonProperty("iconName", NullValueHandling = NullValueHandling.Ignore)] public string IconName { get; set; }
        [JsonProperty("imageUrl", NullValueHandling = NullValueHandling.Ignore)] public string ImageUrl { get; set; }
        // Maker-authored bands above and below the form. Null unless the maker set a part,
        // so a form with no bands publishes byte-identical JSON.
        [JsonProperty("header", NullValueHandling = NullValueHandling.Ignore)] public FormBand Header { get; set; }
        [JsonProperty("footer", NullValueHandling = NullValueHandling.Ignore)] public FormBand Footer { get; set; }
        [JsonProperty("allowSaveDraft")] public bool AllowSaveDraft { get; set; }
        [JsonProperty("draftExpiryDays")] public int? DraftExpiryDays { get; set; }
        [JsonProperty("powerAutomateFlowId")] public string PowerAutomateFlowId { get; set; }
        [JsonProperty("confirmationMessage")] public string ConfirmationMessage { get; set; }
        [JsonProperty("confirmationRecordRefAttribute")] public string ConfirmationRecordRefAttribute { get; set; }
        [JsonProperty("accessGroupId")] public string AccessGroupId { get; set; }
        [JsonProperty("allowInfocardSkip")] public bool AllowInfocardSkip { get; set; }
        [JsonProperty("infocardCountsInProgress")] public bool InfocardCountsInProgress { get; set; }
        [JsonProperty("infocardBackLabel")] public string InfocardBackLabel { get; set; }
        [JsonProperty("infocardContinueLabel")] public string InfocardContinueLabel { get; set; }
        [JsonProperty("infocardStartLabel")] public string InfocardStartLabel { get; set; }
        [JsonProperty("infocardSkipLabel")] public string InfocardSkipLabel { get; set; }
        [JsonProperty("showSummaryStep")] public bool ShowSummaryStep { get; set; }
        // DFE-FBE-001: None/SystemGenerated/Manual. Omitted when unset (legacy forms derive from
        // showSummaryStep at runtime) so unaffected forms stay byte-identical.
        [JsonProperty("summaryMode", NullValueHandling = NullValueHandling.Ignore)] public string SummaryMode { get; set; }
        // DFE-SUBMITCONFIRM-001: form-level acknowledgement. Previously read only by the
        // portal's live-metadata path, so a form configured with one behaved differently
        // in CRM; publishing it here makes both runtimes agree.
        [JsonProperty("submitConfirmation", NullValueHandling = NullValueHandling.Ignore)] public SubmitConfirmationConfig SubmitConfirmation { get; set; }
        // DFE-FBE-002: form-completion progress bar. Omitted unless true → unaffected forms byte-identical.
        [JsonProperty("showProgressBar", NullValueHandling = NullValueHandling.Ignore)] public bool? ShowProgressBar { get; set; }
        [JsonProperty("infoCards")] public List<InfoCardScreen> InfoCards { get; set; }
        [JsonProperty("submissionMappings")] public List<SubmissionMapping> SubmissionMappings { get; set; }
        [JsonProperty("buttons")] public List<FormButton> Buttons { get; set; }
        [JsonProperty("tabs")] public List<TabDefinition> Tabs { get; set; }
        // DFE-STYLE-001: design/styling payload. Omitted when the form has no design so
        // design-less forms keep a byte-identical render-cache JSON.
        [JsonProperty("design", NullValueHandling = NullValueHandling.Ignore)] public DesignPayload Design { get; set; }
        [JsonProperty("createdAt")] public DateTime? CreatedAt { get; set; }
        [JsonProperty("modifiedAt")] public DateTime? ModifiedAt { get; set; }
    }

    /// <summary>A top-level tab within the form that groups sections.</summary>
    public sealed class TabDefinition
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("formDefinitionId")] public Guid FormDefinitionId { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("iconName")] public string IconName { get; set; }
        // DFE-FBE-001: tab description (omitted when null) + manual-summary flag (omitted unless true).
        [JsonProperty("description", NullValueHandling = NullValueHandling.Ignore)] public string Description { get; set; }
        [JsonProperty("isSummaryTab", NullValueHandling = NullValueHandling.Ignore)] public bool? IsSummaryTab { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("isVisible")] public bool IsVisible { get; set; }
        [JsonProperty("requiresPreviousTabComplete")] public bool RequiresPreviousTabComplete { get; set; }
        [JsonProperty("hideTabBar")] public bool HideTabBar { get; set; }
        // Omitted when false so every form that predates the feature stays byte-identical.
        [JsonProperty("revealsSectionsOneAtATime", NullValueHandling = NullValueHandling.Ignore)]
        public bool? RevealsSectionsOneAtATime { get; set; }
        [JsonProperty("sections")] public List<SectionDefinition> Sections { get; set; }
        // DFE-BTN-001: tab-scoped buttons. Omitted when empty so button-less forms are byte-identical.
        [JsonProperty("buttons", NullValueHandling = NullValueHandling.Ignore)] public List<ScopedButton> Buttons { get; set; }
        // DFE-SUBMITCONFIRM-002: acknowledgement required on this tab. Omitted when the maker
        // has not enabled it, so unaffected forms stay byte-identical.
        [JsonProperty("submitConfirmation", NullValueHandling = NullValueHandling.Ignore)] public SubmitConfirmationConfig SubmitConfirmation { get; set; }
    }

    /// <summary>An acknowledgement the user must tick before the form can be submitted.</summary>
    public sealed class SubmitConfirmationConfig
    {
        [JsonProperty("checkboxLabel")] public string CheckboxLabel { get; set; }
        [JsonProperty("dialogMessage", NullValueHandling = NullValueHandling.Ignore)] public string DialogMessage { get; set; }
    }

    /// <summary>A section within a tab that groups fields.</summary>
    public sealed class SectionDefinition
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("tabId")] public Guid TabId { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        // DFE-FBE-001: section header icon (omitted when null → unaffected forms byte-identical).
        [JsonProperty("iconName", NullValueHandling = NullValueHandling.Ignore)] public string IconName { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("columns")] public int Columns { get; set; }
        [JsonProperty("isCollapsible")] public bool IsCollapsible { get; set; }
        [JsonProperty("isCollapsedByDefault")] public bool IsCollapsedByDefault { get; set; }
        [JsonProperty("isVisible")] public bool IsVisible { get; set; }
        [JsonProperty("fields")] public List<FieldDefinition> Fields { get; set; }
        // DFE-BTN-001: section-scoped buttons. Omitted when empty so button-less forms are byte-identical.
        [JsonProperty("buttons", NullValueHandling = NullValueHandling.Ignore)] public List<ScopedButton> Buttons { get; set; }
    }

    /// <summary>A single form field with all display, validation and layout properties.</summary>
    public sealed class FieldDefinition
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("sectionId")] public Guid SectionId { get; set; }
        [JsonProperty("fieldType")] public string FieldType { get; set; }
        [JsonProperty("schemaName")] public string SchemaName { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("placeholder")] public string Placeholder { get; set; }
        [JsonProperty("tooltip")] public string Tooltip { get; set; }
        [JsonProperty("prefix")] public string Prefix { get; set; }
        [JsonProperty("suffix")] public string Suffix { get; set; }
        [JsonProperty("defaultValue")] public string DefaultValue { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("columnSpan")] public int ColumnSpan { get; set; }
        [JsonProperty("isRequired")] public bool IsRequired { get; set; }
        [JsonProperty("isReadonly")] public bool IsReadonly { get; set; }
        [JsonProperty("isHidden")] public bool IsHidden { get; set; }
        [JsonProperty("isVisible")] public bool IsVisible { get; set; }
        [JsonProperty("options")] public List<OptionValue> Options { get; set; }
        [JsonProperty("lookupConfig")] public LookupConfig LookupConfig { get; set; }
        [JsonProperty("fileUploadConfig")] public FileUploadConfig FileUploadConfig { get; set; }
        [JsonProperty("currencyCode")] public string CurrencyCode { get; set; }
        [JsonProperty("decimalPlaces")] public int? DecimalPlaces { get; set; }
        [JsonProperty("numberDisplayStyle", NullValueHandling = NullValueHandling.Ignore)] public string NumberDisplayStyle { get; set; }
        [JsonProperty("barMaxFieldSchemaName", NullValueHandling = NullValueHandling.Ignore)] public string BarMaxFieldSchemaName { get; set; }
        // DFE-BARSRC-001: bar numbers read from a CRM record. Omitted when no config row exists.
        // DFE-BARSRC-001: where the bar's BOUNDS come from. Omitted for the default
        // ("formField"), so bars predating this stay byte-identical. The AMOUNT is separate —
        // BarValueFieldSchemaName above, or this field's own value.
        [JsonProperty("barSource", NullValueHandling = NullValueHandling.Ignore)] public string BarSource { get; set; }
        [JsonProperty("barMin", NullValueHandling = NullValueHandling.Ignore)] public decimal? BarMin { get; set; }
        [JsonProperty("barMax", NullValueHandling = NullValueHandling.Ignore)] public decimal? BarMax { get; set; }
        [JsonProperty("barSourceEntity", NullValueHandling = NullValueHandling.Ignore)] public string BarSourceEntity { get; set; }
        [JsonProperty("barMinAttribute", NullValueHandling = NullValueHandling.Ignore)] public string BarMinAttribute { get; set; }
        [JsonProperty("barValueFieldSchemaName", NullValueHandling = NullValueHandling.Ignore)] public string BarValueFieldSchemaName { get; set; }
        [JsonProperty("maxRows")] public int? MaxRows { get; set; }
        [JsonProperty("componentKey")] public string ComponentKey { get; set; }
        // DFE-FBE-001: Label field — static content + optional data-bound source field.
        [JsonProperty("staticContent", NullValueHandling = NullValueHandling.Ignore)] public string StaticContent { get; set; }
        [JsonProperty("sourceFieldSchemaName", NullValueHandling = NullValueHandling.Ignore)] public string SourceFieldSchemaName { get; set; }
        // Actions a read-only file field offers per document. Null is omitted from the JSON
        // and the runtime treats absent as enabled, so pre-existing fields keep both.
        [JsonProperty("showDocumentView", NullValueHandling = NullValueHandling.Ignore)] public bool? ShowDocumentView { get; set; }
        [JsonProperty("showDocumentDownload", NullValueHandling = NullValueHandling.Ignore)] public bool? ShowDocumentDownload { get; set; }
        [JsonProperty("trueLabel")] public string TrueLabel { get; set; }
        [JsonProperty("falseLabel")] public string FalseLabel { get; set; }
        [JsonProperty("boolRenderStyle")] public string BoolRenderStyle { get; set; }
        [JsonProperty("multiselectRenderStyle")] public string MultiselectRenderStyle { get; set; }
        [JsonProperty("radioRenderStyle")] public string RadioRenderStyle { get; set; }
        [JsonProperty("optionSourceEntity")] public string OptionSourceEntity { get; set; }
        [JsonProperty("optionSourceAttribute")] public string OptionSourceAttribute { get; set; }
        [JsonProperty("infoCardStyle", NullValueHandling = NullValueHandling.Ignore)] public string InfoCardStyle { get; set; }
        [JsonProperty("infoCardTitle")] public string InfoCardTitle { get; set; }
        [JsonProperty("infoCardBody")] public string InfoCardBody { get; set; }
        [JsonProperty("infoCardIcon")] public string InfoCardIcon { get; set; }
        [JsonProperty("infoCardListType", NullValueHandling = NullValueHandling.Ignore)] public string InfoCardListType { get; set; }
        [JsonProperty("infoCardListMarker", NullValueHandling = NullValueHandling.Ignore)] public string InfoCardListMarker { get; set; }
        [JsonProperty("infoCardDownloadUrl")] public string InfoCardDownloadUrl { get; set; }
        [JsonProperty("infoCardDownloadLabel")] public string InfoCardDownloadLabel { get; set; }
        [JsonProperty("infoCardDownloadIcon")] public string InfoCardDownloadIcon { get; set; }
        [JsonProperty("fileDownloadLabel")] public string FileDownloadLabel { get; set; }
        [JsonProperty("fileDownloadIcon")] public string FileDownloadIcon { get; set; }
        [JsonProperty("uploadDocumentSetting")] public string UploadDocumentSetting { get; set; }
        [JsonProperty("downloadDocumentSetting")] public string DownloadDocumentSetting { get; set; }
        [JsonProperty("gridConfig")] public GridFieldConfig GridConfig { get; set; }
        [JsonProperty("validationRules")] public List<ValidationRule> ValidationRules { get; set; }
        [JsonProperty("businessRules")] public List<BusinessRule> BusinessRules { get; set; }
    }

    /// <summary>A selectable option for dropdown, multiselect, or radio fields.</summary>
    public sealed class OptionValue
    {
        [JsonProperty("value")] public string Value { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("isDefault")] public bool IsDefault { get; set; }
        [JsonProperty("parentOptionValue")] public string ParentOptionValue { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("iconName")] public string IconName { get; set; }
        [JsonProperty("notes")] public string Notes { get; set; }
        [JsonProperty("optionRecordId")] public Guid? OptionRecordId { get; set; }
    }

    /// <summary>Configuration for lookup fields that fetch records from CRM.</summary>
    public sealed class LookupConfig
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("entityLogicalName")] public string EntityLogicalName { get; set; }
        [JsonProperty("displayAttribute")] public string DisplayAttribute { get; set; }
        [JsonProperty("valueAttribute")] public string ValueAttribute { get; set; }
        [JsonProperty("filterExpression")] public string FilterExpression { get; set; }
        [JsonProperty("searchMinChars")] public int SearchMinChars { get; set; }
        [JsonProperty("maxResults")] public int MaxResults { get; set; }
        [JsonProperty("dependsOnFieldId")] public Guid? DependsOnFieldId { get; set; }
        [JsonProperty("dependsOnFilterTemplate")] public string DependsOnFilterTemplate { get; set; }
        // DFE-APILOOKUP-001 — NullValueHandling.Ignore keeps entity-sourced lookups byte-identical.
        [JsonProperty("source", NullValueHandling = NullValueHandling.Ignore)] public string Source { get; set; }
        [JsonProperty("apiEndpointKey", NullValueHandling = NullValueHandling.Ignore)] public string ApiEndpointKey { get; set; }
        [JsonProperty("apiValuePath", NullValueHandling = NullValueHandling.Ignore)] public string ApiValuePath { get; set; }
        [JsonProperty("apiLabelPath", NullValueHandling = NullValueHandling.Ignore)] public string ApiLabelPath { get; set; }
        [JsonProperty("apiSearchParamName", NullValueHandling = NullValueHandling.Ignore)] public string ApiSearchParamName { get; set; }
        [JsonProperty("apiSearchMode", NullValueHandling = NullValueHandling.Ignore)] public string ApiSearchMode { get; set; }
        // DFE-LKPCOL-001 — multi-column + per-language display.
        [JsonProperty("displayColumns", NullValueHandling = NullValueHandling.Ignore)] public List<LookupDisplayColumn> DisplayColumns { get; set; }
    }

    public sealed class LookupDisplayColumn
    {
        [JsonProperty("attribute")] public string Attribute { get; set; }
        [JsonProperty("arabicAttribute", NullValueHandling = NullValueHandling.Ignore)] public string ArabicAttribute { get; set; }
        [JsonProperty("header", NullValueHandling = NullValueHandling.Ignore)] public string Header { get; set; }
    }

    /// <summary>Validation rule applied to a field before form submission.</summary>
    public sealed class ValidationRule
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("fieldId")] public Guid FieldId { get; set; }
        [JsonProperty("ruleType")] public string RuleType { get; set; }
        [JsonProperty("errorMessage")] public string ErrorMessage { get; set; }
        [JsonProperty("minLength")] public int? MinLength { get; set; }
        [JsonProperty("maxLength")] public int? MaxLength { get; set; }
        [JsonProperty("minValue")] public decimal? MinValue { get; set; }
        [JsonProperty("maxValue")] public decimal? MaxValue { get; set; }
        [JsonProperty("regexPattern")] public string RegexPattern { get; set; }
        [JsonProperty("compareToFieldId")] public Guid? CompareToFieldId { get; set; }
        [JsonProperty("compareToValue")] public string CompareToValue { get; set; }
        [JsonProperty("customExpression")] public string CustomExpression { get; set; }
        [JsonProperty("ruleTemplateId")] public Guid? RuleTemplateId { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
        [JsonProperty("priority")] public int Priority { get; set; }
    }

    /// <summary>A conditional rule that shows, hides, or modifies fields at runtime.</summary>
    public sealed class BusinessRule
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("conditions")] public List<RuleCondition> Conditions { get; set; }
        [JsonProperty("conditionsLogic")] public string ConditionsLogic { get; set; }
        [JsonProperty("action")] public string Action { get; set; }
        [JsonProperty("targetFieldId")] public Guid? TargetFieldId { get; set; }
        [JsonProperty("targetSectionId")] public Guid? TargetSectionId { get; set; }
        [JsonProperty("targetTabId")] public Guid? TargetTabId { get; set; }
        [JsonProperty("actionValue")] public string ActionValue { get; set; }
        [JsonProperty("priority")] public int Priority { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>A single condition within a business rule's condition set.</summary>
    public sealed class RuleCondition
    {
        // Schema name (matches the runtime, which keys form data by schema name). Legacy rows
        // store a GUID here that is resolved to the schema name during assembly.
        [JsonProperty("fieldId")] public string FieldId { get; set; }
        [JsonProperty("operator")] public string Operator { get; set; }
        [JsonProperty("value")] public object Value { get; set; }
        [JsonProperty("logicalOperator")] public string LogicalOperator { get; set; }
    }

    /// <summary>Configuration for file upload fields.</summary>
    public sealed class FileUploadConfig
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("fieldId")] public Guid FieldId { get; set; }
        [JsonProperty("allowedMimeTypes")] public List<string> AllowedMimeTypes { get; set; }
        [JsonProperty("maxFileSizeBytes")] public long MaxFileSizeBytes { get; set; }
        [JsonProperty("destination")] public string Destination { get; set; }
        [JsonProperty("maxFiles")] public int MaxFiles { get; set; }
        [JsonProperty("documentType")] public int? DocumentType { get; set; }
        [JsonProperty("allowedFileExtensions")] public List<int> AllowedFileExtensions { get; set; }
    }

    /// <summary>Maps a form field value to a CRM entity attribute during submission.</summary>
    public sealed class SubmissionMapping
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("formDefinitionId")] public Guid FormDefinitionId { get; set; }
        [JsonProperty("fieldId")] public Guid FieldId { get; set; }
        [JsonProperty("targetEntityLogicalName")] public string TargetEntityLogicalName { get; set; }
        [JsonProperty("targetAttributeLogicalName")] public string TargetAttributeLogicalName { get; set; }
        // Optional binding overrides. Omitted when blank, which is the normal case — the
        // runtime then resolves the navigation property and entity set from metadata.
        [JsonProperty("targetNavigationProperty", NullValueHandling = NullValueHandling.Ignore)] public string TargetNavigationProperty { get; set; }
        [JsonProperty("targetEntitySetName", NullValueHandling = NullValueHandling.Ignore)] public string TargetEntitySetName { get; set; }
        [JsonProperty("isMappedToChildEntity")] public bool IsMappedToChildEntity { get; set; }
        [JsonProperty("childEntityRelationshipName")] public string ChildEntityRelationshipName { get; set; }
        [JsonProperty("transformExpression")] public string TransformExpression { get; set; }
        // DFE-GRIDCHILD-001: set = the source field is an entry grid and this mapping reads
        // the named column, one child record per row. Omitted when blank.
        [JsonProperty("gridColumnAttribute", NullValueHandling = NullValueHandling.Ignore)] public string GridColumnAttribute { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>A button rendered on the form footer (submit, save draft, cancel, reset).</summary>
    public sealed class FormButton
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("formDefinitionId")] public Guid FormDefinitionId { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("action")] public string Action { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("isVisible")] public bool IsVisible { get; set; }
        [JsonProperty("isPrimary")] public bool IsPrimary { get; set; }
        [JsonProperty("confirmationRequired")] public bool ConfirmationRequired { get; set; }
        [JsonProperty("confirmationMessage")] public string ConfirmationMessage { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
    }

    /// <summary>
    /// DFE-BTN-001: a button scoped to a tab or section, with a discriminated-union action.
    /// The Action is emitted as the parsed action-config object (JObject) so the serialized
    /// shape matches the shared ScopedButtonAction contract consumed by all runtimes.
    /// </summary>
    public sealed class ScopedButton
    {
        [JsonProperty("id")] public Guid Id { get; set; }
        [JsonProperty("placementScope")] public string PlacementScope { get; set; }
        [JsonProperty("placementId")] public Guid PlacementId { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("isPrimary")] public bool IsPrimary { get; set; }
        [JsonProperty("isVisible")] public bool IsVisible { get; set; }
        [JsonProperty("confirmationRequired")] public bool ConfirmationRequired { get; set; }
        [JsonProperty("confirmationMessage", NullValueHandling = NullValueHandling.Ignore)] public string ConfirmationMessage { get; set; }
        [JsonProperty("action")] public object Action { get; set; }
        [JsonProperty("isActive")] public bool IsActive { get; set; }
        // DFE-CBTN-001: optional per-button conditional visibility / enablement. Emitted
        // verbatim as { conditions: [...], logic: "AND"|"OR" }; omitted when null so the
        // button falls back to its static isVisible / isActive flag (legacy behavior).
        [JsonProperty("visibleWhen", NullValueHandling = NullValueHandling.Ignore)] public object VisibleWhen { get; set; }
        [JsonProperty("enabledWhen", NullValueHandling = NullValueHandling.Ignore)] public object EnabledWhen { get; set; }
    }

    /// <summary>Grid field configuration for interactive-grid and repeatingGrid field types.</summary>
    public sealed class GridFieldConfig
    {
        [JsonProperty("gridMode")] public string GridMode { get; set; }
        [JsonProperty("targetEntity")] public string TargetEntity { get; set; }
        [JsonProperty("savedViewId")] public string SavedViewId { get; set; }
        [JsonProperty("selectionMode")] public string SelectionMode { get; set; }
        [JsonProperty("minRows")] public int MinRows { get; set; }
        [JsonProperty("maxRows")] public int MaxRows { get; set; }
        [JsonProperty("columnConfigs")] public List<GridColumnConfig> ColumnConfigs { get; set; }
        [JsonProperty("mode")] public string Mode { get; set; }
        [JsonProperty("entityName")] public string EntityName { get; set; }
        [JsonProperty("filterExpression")] public string FilterExpression { get; set; }
        // Comma-separated form-field schema names driving the depends-on filter template.
        [JsonProperty("dependsOnFieldId", NullValueHandling = NullValueHandling.Ignore)] public string DependsOnFieldId { get; set; }
        [JsonProperty("dependsOnFilterTemplate", NullValueHandling = NullValueHandling.Ignore)] public string DependsOnFilterTemplate { get; set; }
        // DFE-GRIDSRC-001: data source + display configuration.
        [JsonProperty("dataSource", NullValueHandling = NullValueHandling.Ignore)] public string DataSource { get; set; }
        [JsonProperty("jsonData", NullValueHandling = NullValueHandling.Ignore)] public string JsonData { get; set; }
        [JsonProperty("displayMode", NullValueHandling = NullValueHandling.Ignore)] public string DisplayMode { get; set; }
        [JsonProperty("cardLayout", NullValueHandling = NullValueHandling.Ignore)] public string CardLayout { get; set; }
        [JsonProperty("selectable", NullValueHandling = NullValueHandling.Ignore)] public bool? Selectable { get; set; }
        [JsonProperty("cardIconName", NullValueHandling = NullValueHandling.Ignore)] public string CardIconName { get; set; }
        // Paging + view configuration.
        [JsonProperty("pageSize", NullValueHandling = NullValueHandling.Ignore)] public int? PageSize { get; set; }
        [JsonProperty("pagingStyle", NullValueHandling = NullValueHandling.Ignore)] public string PagingStyle { get; set; }
        [JsonProperty("viewMode", NullValueHandling = NullValueHandling.Ignore)] public string ViewMode { get; set; }
    }

    /// <summary>Column configuration within a grid field.</summary>
    public sealed class GridColumnConfig
    {
        [JsonProperty("columnId")] public Guid ColumnId { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("columnLabel")] public string ColumnLabel { get; set; }
        [JsonProperty("targetAttribute")] public string TargetAttribute { get; set; }
        [JsonProperty("columnFieldType")] public string ColumnFieldType { get; set; }

        /// <summary>
        /// Whether the renderer draws this column. Hidden columns are still published so their
        /// values round-trip; the reader used to filter them out of the query, which removed
        /// them from the JSON altogether.
        /// </summary>
        [JsonProperty("isVisible")] public bool IsVisible { get; set; }

        /// <summary>Whether every row must carry a value in this column.</summary>
        [JsonProperty("isRequired")] public bool IsRequired { get; set; }

        /// <summary>Character ceiling, or null for no limit.</summary>
        [JsonProperty("maxLength", NullValueHandling = NullValueHandling.Ignore)]
        public int? MaxLength { get; set; }

        /// <summary>Named shape the value must take — GridValidationFormat in the shared types.</summary>
        [JsonProperty("validationFormat", NullValueHandling = NullValueHandling.Ignore)]
        public string ValidationFormat { get; set; }

        /// <summary>Regular expression, honoured only when ValidationFormat is 'custom'.</summary>
        [JsonProperty("validationPattern", NullValueHandling = NullValueHandling.Ignore)]
        public string ValidationPattern { get; set; }

        /// <summary>Message shown when this column fails; blank falls back to a generated one.</summary>
        [JsonProperty("validationMessage", NullValueHandling = NullValueHandling.Ignore)]
        public string ValidationMessage { get; set; }

        [JsonProperty("filterType")] public string FilterType { get; set; }
        [JsonProperty("lookupTargetEntity")] public string LookupTargetEntity { get; set; }
        [JsonProperty("lookupDisplayAttribute")] public string LookupDisplayAttribute { get; set; }
        [JsonProperty("lookupValueAttribute")] public string LookupValueAttribute { get; set; }
        [JsonProperty("options")] public List<GridColumnOptionValue> Options { get; set; }
    }

    /// <summary>
    /// A maker-authored band above or below the form. Text is PLAIN, not HTML — the form side
    /// has no sanitiser, and a banner authored by anyone with designer access reaches every
    /// user of the form.
    /// </summary>
    public sealed class FormBand
    {
        [JsonProperty("text", NullValueHandling = NullValueHandling.Ignore)] public string Text { get; set; }
        [JsonProperty("imageUrl", NullValueHandling = NullValueHandling.Ignore)] public string ImageUrl { get; set; }
    }

    /// <summary>A selectable option within a grid column.</summary>
    public sealed class GridColumnOptionValue
    {
        [JsonProperty("value")] public string Value { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
    }

    /// <summary>A full info card screen shown between form tabs.</summary>
    public sealed class InfoCardScreen
    {
        [JsonProperty("screenId")] public Guid ScreenId { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("iconUrl")] public string IconUrl { get; set; }
        [JsonProperty("iconAltText")] public string IconAltText { get; set; }
        [JsonProperty("heading")] public string Heading { get; set; }
        [JsonProperty("subHeading")] public string SubHeading { get; set; }
        [JsonProperty("sections")] public List<InfoCardSection> Sections { get; set; }
    }

    /// <summary>A section within an info card screen.</summary>
    public sealed class InfoCardSection
    {
        [JsonProperty("sectionId")] public Guid SectionId { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("sectionTitle")] public string SectionTitle { get; set; }
        [JsonProperty("sectionType")] public string SectionType { get; set; }
        [JsonProperty("noteText")] public string NoteText { get; set; }
        [JsonProperty("items")] public List<InfoCardItem> Items { get; set; }
    }

    /// <summary>A single item within an info card section.</summary>
    public sealed class InfoCardItem
    {
        [JsonProperty("itemId")] public Guid ItemId { get; set; }
        [JsonProperty("displayOrder")] public int DisplayOrder { get; set; }
        [JsonProperty("itemTitle")] public string ItemTitle { get; set; }
        [JsonProperty("itemDescription")] public string ItemDescription { get; set; }
        [JsonProperty("iconReference")] public string IconReference { get; set; }
        [JsonProperty("downloadUrl")] public string DownloadUrl { get; set; }
    }
}
