═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        Dynamic Form Engine — Multi-Language / i18n Support
Engagement ID:  DFE-i18n-001
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-06-24
Version:        1.0
Status:         DRAFT — Pending CEO Approval
Parent BRD:     DFE (2026-05-08) — APPROVED
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
─────────────────────────────────────────────────────────────────────
The Dynamic Form Engine (DFE) is a live banking portal at Qatar
Development Bank (QDB) that renders configurable forms stored in
Microsoft Dataverse and served to customers via a React web
application and a React Native mobile application. All user-facing
content — field labels, placeholders, error messages, tab and section
headings, option set values, info-card content, and button labels —
is currently stored and rendered exclusively in English. QDB operates
in a bilingual environment where Arabic is an equal first language for
a substantial portion of its customer base. The inability to present
forms in Arabic creates a material accessibility barrier, exposes QDB
to regulatory risk under Qatar's language and accessibility standards,
and places the bank at a competitive disadvantage relative to peers
that already offer fully Arabic-language digital services. This
addendum defines requirements to introduce Arabic as a co-equal
language alongside English across all three DFE surfaces — the
customer-facing web portal renderer, the mobile application, and the
internal form designer. All translatable strings must be authorable
and storable inside Dataverse without any code deployment, full
right-to-left (RTL) layout reversal must be applied automatically
when Arabic is active, and the architecture must be extensible to
additional languages without further structural change. The expected
outcome is a DFE that any QDB customer can use in their preferred
language (EN or AR) with zero degradation in functionality,
accessibility, or performance relative to the English-only baseline.


2. BUSINESS OBJECTIVES
─────────────────────────────────────────────────────────────────────
BO-i18n-001: Enable QDB portal customers to complete banking forms in
             Arabic so that the bank serves its bilingual customer
             base without requiring customers to navigate a foreign-
             language interface.

BO-i18n-002: Enable QDB portal customers to complete banking forms on
             mobile devices in Arabic with full RTL layout so that the
             mobile experience is a first-class bilingual citizen, not
             an afterthought.

BO-i18n-003: Enable the CRM Configuration Team to enter and maintain
             Arabic translations for all form content directly inside
             the form designer so that translations are a configuration
             activity, not a development activity, and zero code
             deployments are required to add or update translated
             strings.

BO-i18n-004: Enable QDB Compliance to demonstrate that all customer-
             facing DFE content is available in Arabic so that the
             bank meets Qatar's bilingual service standards and reduces
             regulatory exposure.

BO-i18n-005: Enable the system to support the addition of future
             languages (e.g. French, Urdu) without structural schema
             changes so that QDB's investment in the i18n architecture
             is not stranded by a later localization requirement.

BO-i18n-006: Enable Arabic-speaking customers who use assistive
             technology (screen readers) to consume DFE forms so that
             the bank's digital accessibility obligations are met for
             its Arabic-speaking population.


3. STAKEHOLDERS
─────────────────────────────────────────────────────────────────────
| Stakeholder                   | Role                        | Interest in this project                                                                      |
|-------------------------------|-----------------------------|-----------------------------------------------------------------------------------------------|
| QDB Portal Customers (Arabic) | End users — web + mobile    | Ability to complete banking forms in Arabic with correct RTL layout                           |
| QDB Portal Customers (EN)     | End users — web + mobile    | No regression in the existing English-language experience                                     |
| CRM Configuration Team        | Form authors                | Ability to enter Arabic translations in the designer without developer involvement             |
| QDB Compliance / Legal        | Regulatory stakeholder      | Evidence that customer-facing digital services are bilingual as required by QDB policy        |
| QDB IT Director               | Technical governance        | Confirmation that the translation architecture is scalable and maintainable                   |
| Relationship Managers         | Internal CRM users          | No impact on existing CRM record structure from i18n layer                                    |
| Maqsad AI — Backend Team      | Delivery                    | Backend API contract changes for language-aware metadata responses                            |
| Maqsad AI — Frontend Team     | Delivery                    | RTL layout implementation, language toggle, Fluent UI v9 RTL configuration                   |
| Maqsad AI — Mobile Team       | Delivery                    | React Native RTL support, language toggle in Expo app                                         |
| Maqsad AI — Architect         | Delivery                    | ADR for translation storage schema (table-per-language vs. JSON column vs. sibling columns)   |
| Maqsad AI — QA                | Delivery                    | Bilingual test coverage for all form surfaces and all translatable entities                   |
| Maqsad AI — Auditor           | Delivery                    | Verification that language-preference data handling meets privacy and residency requirements  |


4. SCOPE
─────────────────────────────────────────────────────────────────────

4.1 In Scope
   - Arabic language support (AR) alongside English (EN) as the launch
     pair; the architecture must be extensible to N languages.
   - All three DFE surfaces: web portal renderer, mobile app (React
     Native + Expo), and the form designer / authoring UI.
   - Full RTL layout reversal when Arabic is the active language:
     text direction, flex direction, icon mirroring where semantically
     appropriate, padding/margin mirroring, and scroll anchoring.
   - Translation of every user-facing string type listed in Section 5
     (Functional Requirements FR-001 through FR-016).
   - Storage of all translations inside Microsoft Dataverse alongside
     the existing form definition entities (qdb_ namespace). No
     separate translation database or third-party localization service.
   - A Translations Panel inside the form designer from which CRM
     configuration authors can enter and save Arabic (and future
     language) translations for every translatable string on every
     form entity.
   - Language toggle control visible on the form UI at runtime:
     clicking EN/AR switches the rendered language and flips the
     layout without a page reload.
   - User language preference persisted in localStorage (web) and
     AsyncStorage (mobile) so the preference survives page/app reloads.
   - Backend API language filter: when a language code is supplied in
     the request, the API returns only the strings for that language,
     not all translations for all languages.
   - Correct HTML lang and dir attributes on all rendered elements
     when Arabic is active, for screen-reader compatibility.
   - CRM-sourced option set fields (optionSourceEntity /
     optionSourceAttribute): leverage Dataverse's native localized
     OptionSet label feature instead of duplicating translations in
     qdb_ records. The backend must retrieve the correct locale's
     labels when building the options list.
   - Fallback behavior: if a translation record does not exist for a
     given string and the requested language, the system falls back
     silently to the English base value. No error is thrown; no
     empty string is rendered.
   - All existing English content must continue to work without any
     migration or re-entry by the CRM Configuration Team.
   - Arabic font rendering: the system must load and apply an
     appropriate Arabic-script typeface (e.g. Cairo, Noto Sans Arabic)
     when Arabic is active.

4.2 Out of Scope
   - Translation of any third-party UI chrome not part of the DFE
     (e.g. Azure AD login screens, Dataverse admin portal UI,
     Power Automate flow notifications).
   - Machine translation or AI-assisted translation suggestion inside
     the designer. Authors enter translations manually.
   - Translation of QDB internal CRM record views (model-driven app
     forms in Dataverse) — these are internal staff tools.
   - Translation of CRM audit log entries — audit records are
     written in the language of the submission event and are not
     subject to i18n requirements.
   - Translation of system-level error responses returned by the
     backend API (HTTP 4xx / 5xx bodies) — these are developer-facing.
   - Translation of email or SMS notifications triggered by Power
     Automate on form submission — these are outside the DFE boundary.
   - Any language other than English and Arabic in the initial release.
     Future languages are in scope for the architecture but not for
     delivery under this engagement.
   - Right-to-left support in the form designer itself (the authoring
     UI). Authors are internal QDB staff; the designer remains LTR.
     Only the translations-panel string-entry fields must support RTL
     text input for Arabic strings.
   - Translation management workflow (approval, review cycles,
     version-controlled translation files). Translations are entered
     directly in the designer and saved to Dataverse.
   - Pluralization rules beyond what Arabic's standard ICU plural
     categories require for the specific strings in scope. The system
     must support ICU plural forms (zero, one, two, few, many, other)
     if any displayed string contains a count (e.g. "1 file selected /
     2 files selected"). Strings that contain no count are exempt.
   - Bidirectional text mixing (LTR content embedded inside RTL
     paragraphs) beyond what the browser's Unicode bidirectional
     algorithm handles automatically.


5. FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────

--- Group A: Translatable Content — Form Root ---

FR-001: Form Root Strings
        The system shall render the form title, form description, and
        confirmation message in the language selected by the user at
        runtime, reading the translated value from Dataverse when a
        translation record exists for the requested language, and
        falling back to the English base value on the FormDefinition
        record when no translation exists.

FR-002: Info-Card Navigation Button Labels
        The system shall render the four info-card navigation button
        labels — infocardBackLabel, infocardContinueLabel,
        infocardStartLabel, and infocardSkipLabel — on qdb_form_definition
        in the user's selected language, falling back to the English base
        value when no translation record exists for the requested
        language.

--- Group B: Translatable Content — Structural Elements ---

FR-003: Tab Labels
        The system shall render each tab label (qdb_form_tab.qdb_label)
        in the user's selected language, reading from the corresponding
        translation record when available and falling back to English.

FR-004: Section Labels and Descriptions
        The system shall render each section label
        (qdb_form_section.qdb_label) and section description
        (qdb_form_section.qdb_description) in the user's selected
        language, falling back to English when no translation exists.

--- Group C: Translatable Content — Field-Level ---

FR-005: Field Labels, Placeholders, and Tooltips
        The system shall render each form field's label, placeholder
        text, and tooltip text in the user's selected language, reading
        translated values from Dataverse when available and falling back
        to the English values on the FieldDefinition record when no
        translation exists.

FR-006: Field Prefix and Suffix
        The system shall render each field's prefix and suffix strings
        in the user's selected language when a translation record exists,
        falling back to the English base values when no translation
        exists.

FR-007: Boolean Field Labels
        The system shall render the trueLabel and falseLabel strings for
        fields of type boolean in the user's selected language, falling
        back to English base values when no translation exists.

FR-008: Checkbox Field Labels
        The system shall render the label for each field of type checkbox
        in the user's selected language, applying the same fallback rule
        as all other field labels.

--- Group D: Translatable Content — Option Sets ---

FR-009: Manually Configured Option Set Values
        The system shall render the label, description, and notes
        properties of each OptionValue record (qdb_form_option_value)
        used by dropdown, radio, and multiselect fields in the user's
        selected language, reading translated values from Dataverse when
        available and falling back to the English base value.

FR-010: CRM-Sourced Option Set Values
        The system shall, for fields where optionSourceEntity and
        optionSourceAttribute are set, retrieve the localized OptionSet
        labels from Dataverse using the native Dataverse localized-label
        API (LCID-based label retrieval) rather than storing a duplicate
        translation in qdb_ translation records. The backend shall pass
        the LCID corresponding to the requested language (1033 for en-US,
        1025 for ar-SA) when querying Dataverse for these labels.

--- Group E: Translatable Content — Grid and Info-Card ---

FR-011: Interactive Grid Column Headers
        The system shall render each column header label
        (GridColumnConfig.columnLabel / qdb_grid_column_config) in the
        user's selected language, falling back to English when no
        translation record exists.

FR-012: Info-Card Screen, Section, and Item Text
        The system shall render all of the following info-card string
        properties in the user's selected language:
        - InfoCardScreen.heading and subHeading
        - InfoCardSection.sectionTitle and noteText
        - InfoCardItem.itemTitle, itemDescription, and downloadLabel
        Fallback to English base values applies when no translation
        record exists for any individual string.

--- Group F: Translatable Content — Validation and Buttons ---

FR-013: Validation Rule Error Messages
        The system shall display validation rule error messages
        (ValidationRule.errorMessage / qdb_form_validation_rule) in the
        user's selected language when the user triggers a validation
        failure, reading the translated error message from Dataverse
        when available and falling back to the English errorMessage base
        value.

FR-014: Form Button Labels
        The system shall render each form button label
        (FormButton.label / qdb_form_button) in the user's selected
        language, falling back to the English base label when no
        translation exists.

--- Group G: Runtime Language Switching ---

FR-015: Language Toggle Control
        The system shall display a language toggle control (EN / AR)
        on every rendered form page on both the web portal and the
        mobile app. Selecting a language shall immediately re-render
        all translatable content in the newly selected language and
        flip the layout direction (LTR to RTL or RTL to LTR) without
        a full page reload and without losing any field values the user
        has already entered.

FR-016: Language Preference Persistence
        The system shall persist the user's selected language choice
        in localStorage (web portal) and AsyncStorage (mobile app) so
        that the selected language is restored automatically when the
        user reloads the page or relaunches the app, without requiring
        the user to re-select their language preference.

--- Group H: RTL Layout ---

FR-017: Full RTL Layout Reversal
        When Arabic is the active language, the system shall apply a
        full directional layout reversal across all three DFE surfaces
        (web portal renderer, mobile app, and the translations panel
        string-entry fields in the designer). This requirement covers:
        (a) text alignment reversal (right-aligned by default);
        (b) flex row direction reversal (row-reverse);
        (c) horizontal padding and margin mirroring;
        (d) icon mirroring where the icon carries directional semantic
            meaning (e.g. back/forward arrows, progress indicators);
        (e) scroll position anchoring at the right edge;
        (f) input field cursor placement and text insertion at the
            right edge.
        Reversal must be achieved by setting the HTML dir="rtl" attribute
        on the root element (web) and by using the I18nManager.forceRTL
        API (React Native) on the mobile app.

FR-018: Arabic Font Loading
        When Arabic is the active language, the system shall load and
        apply an Arabic-script web font (e.g. Cairo or Noto Sans Arabic,
        minimum weight range 400–700) to all rendered text on the web
        portal. The mobile app shall use a system Arabic font or a
        bundled Arabic font with equivalent coverage. Font loading must
        not block the initial form render; fonts shall be loaded
        asynchronously and applied on arrival.

--- Group I: Accessibility ---

FR-019: HTML lang and dir Attributes
        The system shall set the lang attribute on the root HTML element
        to "en" when English is active and "ar" when Arabic is active.
        The system shall set the dir attribute to "ltr" when English is
        active and "rtl" when Arabic is active. These attributes must
        be set on any dynamically rendered container elements that
        contain field content, not only on the document root, to ensure
        screen readers announce content in the correct language and
        reading direction.

FR-020: Screen Reader Label Correctness
        When Arabic is active, all ARIA labels, ARIA descriptions, and
        accessible name derivations for form controls shall be provided
        in Arabic (from translated values) so that Arabic screen readers
        announce field names and instructions in Arabic.

--- Group J: Designer Authoring ---

FR-021: Translations Panel in Form Designer
        The form designer shall provide a Translations Panel accessible
        from each form entity editor (form root, tab, section, field,
        option value, grid column, info-card screen/section/item,
        validation rule, button). The Translations Panel shall:
        (a) list every translatable string for the selected entity;
        (b) show the English base value as a read-only reference;
        (c) provide an editable input for each supported language
            (Arabic at launch, extendable to future languages);
        (d) save entries directly to Dataverse translation records on
            user action, without requiring a UI code deployment.
        The Translations Panel must be accessible without any change
        to the designer application code when a new language is added
        to the language configuration in Dataverse.

FR-022: Designer RTL Text Input
        Within the Translations Panel, input fields for Arabic string
        entry shall render with dir="rtl" and the appropriate Arabic
        font so that form authors can read and correct Arabic text
        accurately. The designer's primary editing surface remains LTR.

--- Group K: Backend API ---

FR-023: Language Code on Metadata API
        The backend metadata API endpoint that returns the FormDefinition
        payload shall accept a lang query parameter (e.g. ?lang=ar or
        ?lang=en). When a lang parameter is provided, the API shall
        return only the translated string values for the requested
        language (or English base values as fallback), not the full
        translation set for all languages. When no lang parameter is
        provided, the API shall default to English (en).

FR-024: Fallback to English on Missing Translation
        The system shall, at the API layer, substitute the English base
        value for any translatable string property where a translation
        record does not exist for the requested language. The client
        shall receive a complete, fully populated FormDefinition object
        regardless of the completeness of the translation data in
        Dataverse. No null or undefined string values shall be returned
        for any translatable property.

FR-025: Language Configuration Endpoint
        The backend shall expose an endpoint that returns the list of
        supported languages (code and display name) configured in
        Dataverse. This endpoint enables the language toggle control to
        be populated dynamically and allows new languages to be added
        to Dataverse configuration without a frontend code change.

--- Group L: Performance ---

FR-026: Language-Scoped Translation Payload
        The backend shall not include translation strings for languages
        other than the one requested in any API response. A form
        definition response for lang=ar shall contain only Arabic
        (or English fallback) strings. A form definition response for
        lang=en shall contain only English strings. The payload size
        of a translated response must not exceed 120% of the payload
        size of the current English-only response for the same form.


6. NON-FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────

NFR-001: Performance — Form Load with Translations
         The P95 time-to-interactive for a form rendered with Arabic
         translations active must not exceed 600 ms under 100 concurrent
         users. This is a 100 ms allowance above the existing NFR-001
         baseline of 500 ms, accounting for the additional Dataverse
         translation query. The backend LRU cache must cache translated
         form definitions per language separately (cache key includes
         formCode + languageCode).

NFR-002: Performance — Language Switch Latency
         The time from the user clicking the language toggle to the
         completion of the full layout re-render (including RTL flip
         and all string substitutions) must not exceed 300 ms on a
         mid-range device under a stable network connection. This
         transition must be achieved without a network round-trip if
         the alternate language's translations were included in the
         initial load or a pre-fetch; otherwise a single API call for
         the alternate language payload is acceptable within this budget.

NFR-003: Performance — Translation Payload Size
         The JSON payload for any single form definition with
         translations for one language must not exceed 150 KB. If any
         form exceeds this threshold, the backend must implement
         per-language lazy loading of translation records outside the
         main form definition response.

NFR-004: Availability — No Degradation
         The addition of the i18n layer must not reduce the platform's
         existing availability target. The form renderer must remain
         fully functional in English if the translation Dataverse tables
         are unreachable, using cached English base values.

NFR-005: Accessibility — WCAG 2.1 AA
         All Arabic-language rendered content must comply with WCAG 2.1
         AA criteria, including: sufficient color contrast ratios
         (4.5:1 for body text), correct lang and dir attribute
         propagation, keyboard navigability in RTL mode, and focus
         indicator visibility on right-to-left focus order.

NFR-006: Accessibility — Screen Reader Compatibility
         Arabic-rendered forms must be tested and confirmed compatible
         with NVDA + Chrome (Windows) and VoiceOver + Safari (iOS) in
         RTL mode. All form controls must have accessible names in
         Arabic when Arabic is active.

NFR-007: Security — Language Parameter Validation
         The lang query parameter on all API endpoints must be validated
         against the configured list of supported language codes
         (returned by FR-025). An unsupported language code must return
         HTTP 400 with a structured error body. The parameter must be
         sanitized before use in any Dataverse query to prevent OData
         injection.

NFR-008: Security — Translation Data Residency
         Arabic translation strings are considered form configuration
         data and are subject to the same data residency constraints as
         the form definition records. All translation data must reside
         in the QDB Dataverse environment (org5869857f.crm4.dynamics.com)
         in the Qatar region. No translation data may be sent to
         external translation services or third-party APIs.

NFR-009: Scalability — Language Extensibility
         Adding a third language must require only: (a) a new language
         configuration record in Dataverse, (b) translation record entry
         in the designer, and (c) no structural schema change and no
         code deployment to the backend API or frontend applications.
         The architect must demonstrate this property in the ADR
         (Architecture Decision Record) for the translation storage
         schema.

NFR-010: Scalability — Translation Volume
         The system must support translation of forms with up to 500
         translatable string instances (across all entities in a single
         form definition) without exceeding NFR-001 or NFR-003 limits.

NFR-011: Maintainability — Separation of i18n Logic
         The RTL layout logic, the language-toggle state management, and
         the translation string resolution logic must each be implemented
         in dedicated, independently testable modules. RTL styles must
         not be co-mingled with LTR styles; a single directional context
         provider must govern the entire rendered form surface.


7. ACCEPTANCE CRITERIA
─────────────────────────────────────────────────────────────────────

AC-001 (covers FR-001):
  Given a form with an Arabic translation record for the form title,
  When the user selects Arabic on the language toggle,
  Then the form title displayed on screen matches the Arabic
  translation stored in Dataverse, not the English base value.

AC-002 (covers FR-001 — fallback):
  Given a form where no Arabic translation record exists for the
  form description,
  When the user selects Arabic on the language toggle,
  Then the form description is displayed using the English base value,
  and no empty string, null value, or error is shown to the user.

AC-003 (covers FR-002):
  Given an info-card screen on a form that has an Arabic translation
  for infocardContinueLabel,
  When the user selects Arabic,
  Then the continue button on the info-card screen displays the
  Arabic label text.

AC-004 (covers FR-009):
  Given a dropdown field with three OptionValue records, each having
  an Arabic translation for their label,
  When the user selects Arabic,
  Then all three option labels in the dropdown render in Arabic.

AC-005 (covers FR-010):
  Given a dropdown field configured with optionSourceEntity and
  optionSourceAttribute pointing to a Dataverse OptionSet that has
  Arabic labels registered natively in Dataverse (LCID 1025),
  When the user selects Arabic,
  Then the option labels displayed are the Dataverse-native Arabic
  labels, not any labels stored in qdb_ translation records.

AC-006 (covers FR-013):
  Given a required text field with an Arabic translation of its
  validation error message,
  When the user submits the form without filling in the required field
  while Arabic is active,
  Then the error message displayed is the Arabic translation, not the
  English base errorMessage.

AC-007 (covers FR-015 — no data loss):
  Given a user who has entered values in three form fields,
  When the user clicks the language toggle to switch from English to
  Arabic,
  Then all three previously entered field values are still present and
  unchanged after the language switch.

AC-008 (covers FR-016 — web):
  Given a user who has selected Arabic on the web portal,
  When the user performs a hard page reload (F5),
  Then the form is displayed in Arabic without the user needing to
  re-select the language.

AC-009 (covers FR-016 — mobile):
  Given a user who has selected Arabic on the mobile app,
  When the user closes the app fully and relaunches it,
  Then the app opens with Arabic as the active language.

AC-010 (covers FR-017):
  Given Arabic is the active language on the web portal,
  When any form page is rendered,
  Then the root element carries dir="rtl", all flex-row containers
  are visually reversed (right-to-left reading order), and
  directional icons (e.g. back arrow) are mirrored horizontally.

AC-011 (covers FR-017 — mobile):
  Given Arabic is the active language on the mobile app,
  When any form screen is rendered,
  Then I18nManager.isRTL returns true, and all navigation and form
  layout elements are displayed in right-to-left order.

AC-012 (covers FR-017 — field value preservation during RTL flip):
  Given a user who has entered values in form fields while English is
  active,
  When the user switches to Arabic (triggering RTL flip),
  Then all field values are preserved and correctly displayed in their
  RTL-mirrored positions.

AC-013 (covers FR-018):
  Given Arabic is active on the web portal,
  When the rendered page is inspected,
  Then the CSS font-family applied to Arabic-language text nodes
  includes an Arabic-script web font (Cairo or Noto Sans Arabic),
  and the font file has been loaded by the browser.

AC-014 (covers FR-019):
  Given Arabic is active,
  When the root HTML element and any dynamic content container elements
  are inspected,
  Then lang="ar" and dir="rtl" are present on the root element, and
  lang="ar" is present on all major rendered content containers.

AC-015 (covers FR-019 — English):
  Given English is active,
  When the root HTML element is inspected,
  Then lang="en" and dir="ltr" are present.

AC-016 (covers FR-020):
  Given Arabic is active and a required text field has an Arabic label,
  When the page is inspected using an accessibility tree inspector
  (e.g. Accessibility tab in Chrome DevTools),
  Then the accessible name of the text input is the Arabic label string,
  not the English label string.

AC-017 (covers FR-021):
  Given a CRM Configuration Team member opens the form designer and
  selects a field entity in the canvas,
  When the member opens the Translations Panel for that field,
  Then the panel displays the English base label as read-only and an
  editable Arabic input field; saving the Arabic input writes a
  translation record to Dataverse without any code deployment.

AC-018 (covers FR-021 — new language extensibility):
  Given a third language (e.g. French) has been added as a language
  configuration record in Dataverse,
  When a CRM Configuration Team member opens the Translations Panel,
  Then a French input field appears alongside the Arabic input field,
  without any change to the designer application code.

AC-019 (covers FR-022):
  Given the Translations Panel is open and the Arabic input field for
  a label contains Arabic text,
  When the input field is inspected,
  Then dir="rtl" is set on that input element, and the Arabic text
  is displayed in a right-to-left reading direction.

AC-020 (covers FR-023):
  Given the backend metadata API is called with ?lang=ar,
  When the response payload is inspected,
  Then all translatable string properties in the FormDefinition
  contain Arabic values (or English fallbacks) and no extraneous
  translation objects for other languages are present.

AC-021 (covers FR-024):
  Given a form where 10% of translatable fields have no Arabic
  translation record,
  When the API is called with ?lang=ar,
  Then the response contains a valid, non-null string for every
  translatable property, with English base values used for the 10%
  that lack Arabic translations.

AC-022 (covers FR-025):
  Given a new language configuration record has been added in
  Dataverse,
  When the language configuration endpoint is called,
  Then the new language appears in the response and the language
  toggle control on the rendered form displays the new language option,
  without any frontend code deployment.

AC-023 (covers FR-026):
  Given a form with 200 translatable string instances,
  When the API is called with ?lang=ar,
  Then the response payload size does not exceed 120% of the payload
  size of the same form called with ?lang=en.

AC-024 (covers NFR-001):
  Given 100 concurrent users each loading the same form with ?lang=ar,
  When a load test is executed against the staging environment,
  Then the P95 time-to-interactive does not exceed 600 ms.

AC-025 (covers NFR-002):
  Given a user on a mid-range device (4-core CPU, 4 GB RAM equivalent)
  with a stable 4G connection,
  When the user clicks the language toggle,
  Then the full layout re-render (all strings and RTL flip) completes
  within 300 ms, measured from click event to last paint completion.

AC-026 (covers NFR-007):
  Given the API is called with an unsupported lang parameter value
  (e.g. ?lang=xx),
  When the request is processed,
  Then the API returns HTTP 400 with a structured JSON error body
  identifying the invalid language code.


8. ASSUMPTIONS AND DEPENDENCIES
─────────────────────────────────────────────────────────────────────

AS-001: The Maqsad AI Architect will produce an ADR selecting the
        Dataverse translation storage schema (options include: sibling
        columns on existing qdb_ tables, a dedicated translation table
        per entity, or a single universal translation table with entity/
        field/language composite keys). This BRD does not prescribe the
        schema; that is an architecture decision.

AS-002: The Arabic translations for all form strings will be authored
        and entered by the QDB CRM Configuration Team. Maqsad AI
        delivery team is responsible for the translation infrastructure
        only, not for providing translated content.

AS-003: Fluent UI v9 (used in the web portal) has documented RTL
        support via its RTL Provider component. This BRD assumes that
        Fluent UI v9's built-in RTL support is sufficient and that no
        custom RTL override styles will be needed for standard Fluent
        UI components (e.g. Combobox, TextField, DatePicker). Any
        deviations discovered during implementation must be documented
        as implementation notes by the frontend team.

AS-004: React Native (Expo) handles RTL natively through I18nManager.
        This BRD assumes the Expo SDK version in use supports
        I18nManager.forceRTL without requiring a native rebuild. The
        mobile team must verify this against the current Expo SDK
        version before implementation begins.

AS-005: The QDB Dataverse environment (org5869857f.crm4.dynamics.com)
        supports the Language Pack for Arabic (LCID 1025) and the native
        Dataverse localized OptionSet label feature. The backend team
        must confirm this capability against the live environment before
        implementing FR-010.

AS-006: The Arabic translations entered by the CRM Configuration Team
        are correct and culturally appropriate. Maqsad AI has no
        translation quality review obligation under this engagement.

AS-007: The performance baseline (NFR-001 500 ms P95) referenced in
        this BRD is the approved baseline from the parent DFE BRD
        (2026-05-08). The i18n NFR-001 of 600 ms is an agreed
        relaxation for the translation-augmented load path.

AS-008: The existing backend LRU cache (node-lru-cache) will be
        extended to cache per-language form definitions as separate
        cache entries (cache key: formCode + languageCode). No new
        caching infrastructure is required.

AS-009: The language configuration records in Dataverse (governing
        which languages are supported) will be created and maintained
        by the CRM Configuration Team. Maqsad AI will define the schema
        for these records; QDB will populate them.

DEPENDENCY-001: The i18n architecture ADR (from AS-001) must be
                approved by the QDB IT Director before backend or
                frontend implementation begins, as the ADR determines
                the Dataverse schema changes and the API contract.

DEPENDENCY-002: The Dataverse Arabic Language Pack must be installed
                and OptionSet Arabic labels must be configured by the
                QDB Dataverse administrator before FR-010 (CRM-sourced
                option set values) can be tested.

DEPENDENCY-003: This engagement depends on the existing DFE Phase 3
                architecture (approved 2026-05-08). Any changes to the
                base form definition API contract introduced by this
                engagement must not break the existing English-language
                form rendering path.


9. RISKS AND MITIGATIONS
─────────────────────────────────────────────────────────────────────

| Risk                                                    | Likelihood | Impact | Mitigation                                                                                                                                                         |
|---------------------------------------------------------|------------|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| R-001: Fluent UI v9 RTL support incomplete for          | Medium     | High   | Spike to be run at the start of the frontend phase. For any Fluent UI component with insufficient RTL support, a custom CSS logical-properties override will be     |
|        specific components (e.g. DatePicker, Combobox)  |            |        | applied. Frontend team must document overrides in phase-4-tech.md.                                                                                                  |
| R-002: React Native RTL requires a native app rebuild   | Medium     | High   | Mobile team must test I18nManager.forceRTL in the current Expo managed workflow before implementation. If a rebuild is required, delivery timeline must be adjusted. |
|        under the current Expo managed workflow          |            |        |                                                                                                                                                                     |
| R-003: Dataverse Arabic Language Pack not installed     | Low        | High   | DEPENDENCY-002 must be confirmed before implementation of FR-010. If not available, CRM-sourced option set values will use manually entered qdb_ translations       |
|        in org5869857f environment                       |            |        | as a temporary workaround, with a clear handoff note.                                                                                                                |
| R-004: Translation payload size exceeds NFR-003         | Low        | Medium | Backend must apply FR-026 (language-scoped payload). If any individual form exceeds 150 KB, per-field lazy loading will be implemented before release.             |
|        (150 KB) for large forms                         |            |        |                                                                                                                                                                     |
| R-005: CRM Configuration Team does not enter Arabic     | High       | Medium | This is a data risk, not a system risk. Go-live gate: at least one complete form (all translatable strings) must be translated and UAT-verified before launch.      |
|        translations before go-live                      |            |        |                                                                                                                                                                     |
| R-006: Language toggle UI placement conflicts with      | Low        | Low    | Language toggle placement and visual design to be agreed with QDB UX stakeholder during the design phase. Fallback: toggle in form header or navigation bar.       |
|        existing form header design                      |            |        |                                                                                                                                                                     |
| R-007: RTL layout breaks existing business rule         | Medium     | Medium | All existing business rule-driven show/hide and conditional logic tests must be re-run against the RTL layout in QA. QA must include RTL-specific test matrix.      |
|        conditional rendering (show/hide fields)         |            |        |                                                                                                                                                                     |
| R-008: Arabic font loading adds perceptible             | Low        | Low    | Font must be loaded asynchronously (FR-018). FOUT (Flash of Unstyled Text) is acceptable; FOIT (Flash of Invisible Text) is not. font-display: swap must be used.  |
|        render delay on first Arabic activation          |            |        |                                                                                                                                                                     |


10. OPEN QUESTIONS
─────────────────────────────────────────────────────────────────────
The following questions remain unresolved and require CEO / QDB IT
Director adjudication before the architecture phase proceeds.

OQ-001: Language Toggle Placement
        Should the language toggle (EN / AR) be rendered inside the
        form itself (e.g. top-right of the form header) or outside
        the form at the portal shell level (navigation bar / header
        component shared across all portal pages)? If placed at the
        shell level, the portal shell team (DXP-P1-001 scope) must
        coordinate the toggle. If inside the form, the DFE team owns
        it. Decision affects both UX design and team ownership.

OQ-002: Language as Part of Form URL
        Should the selected language be reflected in the URL
        (e.g. /form/loan-application?lang=ar) so that Arabic-language
        forms can be directly bookmarked and shared? If yes, the
        routing layer must be updated. If no, language is session/
        storage state only.

OQ-003: Default Language for New Sessions
        When a user arrives at a form for the first time with no stored
        language preference (no localStorage entry), what should the
        default language be? Options: (a) always English, (b) derive
        from the browser's Accept-Language header, or (c) a QDB-
        configured default per form. The business default has not been
        stated and must be confirmed by QDB.

OQ-004: Translation Completeness Gate for Publication
        Should the form designer block publication of a form whose
        Arabic translations are incomplete (i.e. one or more strings
        have no Arabic translation record)? Or should publication
        proceed with English fallback for untranslated strings? If a
        completeness gate is required, this adds a publication
        validation step to the designer that is not currently in scope.

OQ-005: Mobile RTL — Hot-Switch vs. App Restart
        Some React Native versions require an app restart to fully
        apply RTL layout when using I18nManager.forceRTL. If the
        current Expo SDK requires a restart, should the mobile app
        prompt the user to restart when they switch to Arabic for the
        first time, or should the mobile app launch in a fixed language
        selected during onboarding? This affects the UX design of the
        mobile language-switching flow and must be confirmed before the
        mobile architecture phase.

OQ-006: Translation Export / Import
        Does QDB require the ability to export all translation strings
        to a spreadsheet (e.g. XLSX or CSV) for offline translation
        by a human translator, and then import the completed file back
        into Dataverse? If yes, this is an addendum to FR-021 and adds
        significant scope to the designer. It is excluded from the
        current scope definition and would require a separate BRD
        addendum.


11. DATA REQUIREMENTS
─────────────────────────────────────────────────────────────────────
| Entity                         | Volume (estimate)           | Retention       | Sensitivity   |
|--------------------------------|-----------------------------|-----------------|---------------|
| Translation records (new)      | ~500 strings x 2 languages  | Same as parent  | Internal      |
|                                | = ~1,000 per form; ~50 forms | form record     |               |
|                                | = ~50,000 total at launch    |                 |               |
| Language configuration records | 2 at launch (EN, AR);       | Indefinite      | Internal      |
|                                | up to 10 over platform life  |                 |               |
| Arabic font assets             | ~200 KB per weight file;    | Static / CDN    | Public        |
|                                | 2 weights = ~400 KB          |                 |               |
| localStorage language key      | 1 key per user session      | Browser-managed | Internal      |
| AsyncStorage language key      | 1 key per mobile device     | App lifetime    | Internal      |

Note: Translation records are form configuration data, not personal
data. They contain no PII. Retention and residency obligations are
the same as the parent form definition records.


12. INTEGRATION DEPENDENCIES
─────────────────────────────────────────────────────────────────────
| System                     | Integration type             | Data exchanged                                                                     | Direction               |
|----------------------------|------------------------------|------------------------------------------------------------------------------------|-------------------------|
| Microsoft Dataverse         | OData Web API (existing)     | Translation records (read/write); localized OptionSet labels (read, LCID-based)    | Backend <-> Dataverse   |
| (org5869857f.crm4.dynamics) |                              |                                                                                    |                         |
| Dataverse OptionSet Labels  | Native LCID label API        | Localized option labels for CRM-sourced fields (LCID 1025 for Arabic)              | Backend <- Dataverse    |
| (FR-010)                   |                              |                                                                                    |                         |
| Backend LRU Cache           | In-process cache extension   | Per-language cached form definitions (cache key: formCode + languageCode)          | Backend internal        |
| Portal Shell (DXP-P1-001)  | UI composition               | Language toggle placement decision (OQ-001); lang/dir attributes on shell root     | Design coordination     |
| Azure CDN / Static Assets   | CDN delivery                 | Arabic web font files (WOFF2)                                                      | Browser <- CDN          |
| localStorage (web)          | Browser API                  | Language preference key (string, "en" or "ar")                                     | Browser internal        |
| AsyncStorage (mobile)       | React Native API             | Language preference key (string, "en" or "ar")                                     | Mobile app internal     |


13. ASSUMPTIONS
─────────────────────────────────────────────────────────────────────
(See Section 8 — Assumptions and Dependencies for the full list of
numbered assumptions AS-001 through AS-009.)


14. RISKS AND OPEN QUESTIONS
─────────────────────────────────────────────────────────────────────
(See Section 9 — Risks and Mitigations, and Section 10 — Open
Questions for the full lists.)


15. GLOSSARY
─────────────────────────────────────────────────────────────────────
| Term                    | Definition                                                                                                    |
|-------------------------|---------------------------------------------------------------------------------------------------------------|
| i18n                    | Internationalization — the process of designing software so it can be adapted to various languages and         |
|                         | regions without engineering changes.                                                                           |
| l10n                    | Localization — the adaptation of internationalized software for a specific language/region (e.g. Arabic/Qatar).|
| RTL                     | Right-to-Left — the text and layout direction used by Arabic, Hebrew, and other languages where text is        |
|                         | read from right to left. Full RTL layout reversal means the entire UI mirrors horizontally.                    |
| LTR                     | Left-to-Right — the default text and layout direction used by English and most Western languages.              |
| LCID                    | Locale Identifier — a Microsoft numeric code identifying a language/locale. 1033 = en-US; 1025 = ar-SA.       |
| lang attribute          | The HTML lang attribute specifies the language of an element's content, enabling screen readers and browsers   |
|                         | to apply correct language-specific processing.                                                                 |
| dir attribute           | The HTML dir attribute specifies the text direction (ltr or rtl) of an element's content.                     |
| OptionSet               | A Dataverse data type that stores a fixed list of labeled integer values. Supports native localized labels     |
|                         | per LCID without code changes.                                                                                 |
| Translations Panel      | The new UI component inside the form designer that allows CRM Configuration Team members to enter and save     |
|                         | translated strings for each form entity.                                                                       |
| Fallback                | The behavior of displaying the English base value when no translation record exists for the requested language. |
| LRU Cache               | Least Recently Used cache — the existing in-process metadata cache in the DFE backend (node-lru-cache).       |
| I18nManager             | React Native's built-in module for controlling layout direction (LTR/RTL) and text alignment system-wide.     |
| FOUT                    | Flash of Unstyled Text — a brief rendering of text in a fallback font before the custom font loads.            |
| FOIT                    | Flash of Invisible Text — text rendered invisible until a custom font loads. Must be avoided.                  |
| font-display: swap      | CSS @font-face descriptor that instructs the browser to use a fallback font immediately and swap to the        |
|                         | custom font when loaded, preventing FOIT.                                                                      |
| InfoCard                | A DFE field type (introduced in DFE-ADD-001) that renders a multi-screen informational presentation before     |
|                         | the interactive form steps, with navigation buttons (back, continue, start, skip).                             |
| Interactive Grid        | A DFE field type (introduced in DFE-ADD-002) that renders a Dataverse record grid inside a form step,         |
|                         | supporting selection mode and data-entry mode with configurable columns.                                       |
| qdb_ prefix             | The Dataverse solution publisher prefix for all custom entities and attributes created for QDB.                |
| OData injection         | An attack where unsanitized input is used to alter the structure of an OData query to Dataverse, analogous    |
|                         | to SQL injection. Language codes must be validated to prevent this.                                            |


16. REQUIREMENTS TRACEABILITY MATRIX
─────────────────────────────────────────────────────────────────────
| Business Objective | User Story / FR              | Acceptance Criteria  | Status |
|--------------------|------------------------------|----------------------|--------|
| BO-i18n-001        | FR-001, FR-003, FR-004,      | AC-001, AC-002,      | Draft  |
|                    | FR-005, FR-009, FR-010,      | AC-004, AC-005,      |        |
|                    | FR-013, FR-015               | AC-006, AC-007       |        |
| BO-i18n-001        | FR-017, FR-018               | AC-010, AC-013       | Draft  |
| BO-i18n-002        | FR-017 (mobile), FR-016      | AC-011, AC-012,      | Draft  |
|                    | (mobile)                     | AC-009               |        |
| BO-i18n-003        | FR-021, FR-022               | AC-017, AC-018,      | Draft  |
|                    |                              | AC-019               |        |
| BO-i18n-004        | FR-001 through FR-014,       | AC-001 through       | Draft  |
|                    | FR-021                       | AC-023               |        |
| BO-i18n-005        | FR-025, NFR-009              | AC-022, AC-018       | Draft  |
| BO-i18n-006        | FR-019, FR-020               | AC-014, AC-015,      | Draft  |
|                    |                              | AC-016               |        |
| All                | FR-023, FR-024, FR-026       | AC-020, AC-021,      | Draft  |
|                    |                              | AC-023               |        |
| All                | NFR-001, NFR-002             | AC-024, AC-025       | Draft  |
| All                | NFR-007                      | AC-026               | Draft  |


17. APPROVAL
─────────────────────────────────────────────────────────────────────
| Role              | Name              | Decision  | Date |
|-------------------|-------------------|-----------|------|
| CEO               | Pending           | PENDING   |      |
| QDB IT Director   | Pending           | PENDING   |      |
| Requestor         | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-i18n-001 v1.0
═══════════════════════════════════════════════════
