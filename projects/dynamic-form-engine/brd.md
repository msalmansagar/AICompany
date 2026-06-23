═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        Dynamic Form Engine Portal — QDB
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-05-08
Version:        1.0
Status:         APPROVED — CEO signed off 2026-05-08
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
─────────────────────────────────────────────────────────────────────
QDB (a commercial bank) requires a configurable portal platform that
allows its CRM configuration team to define and publish new banking
forms — such as loan applications, KYC forms, and customer onboarding
flows — entirely within Microsoft Dataverse, without writing or
deploying frontend code for each new form. The proposed solution is a
metadata-driven Dynamic Form Engine Portal: a React-based web
application that reads form structure, validation rules, conditional
logic, and CRM submission mappings from 12 Dataverse configuration
tables at runtime, renders those forms for bank customers, and writes
completed submissions back to Dataverse as structured CRM records. The
expected business outcome is a reduction in time-to-launch for new
banking forms from weeks (development + deployment cycle) to hours
(CRM configuration only), while maintaining full audit compliance and
integration with QDB's existing Dynamics CRM/Dataverse ecosystem.


2. BUSINESS OBJECTIVES
─────────────────────────────────────────────────────────────────────
BO-001: Enable the CRM Configuration Team to define and publish new
        portal forms entirely in Dataverse so that new banking
        products and compliance forms can be launched without
        frontend code changes or redeployment.

BO-002: Enable Portal Users (bank customers) to complete multi-tab,
        multi-section banking forms with guided validation so that
        form completion rates increase and error-driven rejections
        decrease.

BO-003: Enable Relationship Managers to receive structured, complete
        CRM records (parent and child) on form submission so that
        manual data re-entry is eliminated and processing time is
        reduced.

BO-004: Enable the Compliance and Audit team to access a tamper-proof
        audit log of every submission event so that the bank meets
        its regulatory record-keeping obligations without manual
        logging.

BO-005: Enable IT and DevOps to deploy and maintain a single portal
        codebase that serves all form types so that infrastructure
        cost and deployment complexity are minimised.

BO-006: Enable the CRM Configuration Team to manage all form
        configuration (fields, rules, validations, lookups) through
        Dataverse admin screens so that CRM team ownership of form
        lifecycle is fully self-service.


3. STAKEHOLDERS
─────────────────────────────────────────────────────────────────────
| Stakeholder               | Role                  | Interest in this project                                          |
|---------------------------|-----------------------|-------------------------------------------------------------------|
| CRM Configuration Team    | Form Author           | Define and maintain all form metadata in Dataverse                |
| Portal Users              | End User              | Submit banking applications and forms through the portal          |
| Relationship Managers     | CRM Consumer          | Review, process, and action submitted records inside CRM          |
| IT / DevOps               | Platform Owner        | Deploy, maintain, and monitor the portal and backend API          |
| Compliance / Audit        | Governance Overseer   | Verify audit trail completeness and regulatory compliance         |
| QDB Product / Business    | Project Sponsor       | Ensure the portal meets business and customer experience goals    |
| Maqsad AI Dev Team        | Delivery Team         | Design, build, test, and hand over the solution                   |


4. SCOPE
─────────────────────────────────────────────────────────────────────

4.1 In Scope
    - Design and implementation of 12 Dataverse configuration tables
      for form metadata storage
    - React portal that renders any form defined in those tables
      without frontend code changes
    - Support for all specified field types (text, textarea, number,
      date, datetime, dropdown, multiselect, lookup, checkbox, radio,
      currency, decimal, email, phone, file upload, repeating grid,
      rich text)
    - Rule engine: show/hide, required/optional/readonly, set/clear/
      calculate values, filter options and lookups based on conditions
    - Validation engine: required, min/max length/value, regex, email,
      phone, date comparison, cross-field, custom expression
    - Save-as-draft and final-submit flows with draft persistence in
      Dataverse
    - Parent-child CRM record creation from submission mapping config
    - CRM workflow / Power Automate trigger on form submission
    - Document upload to CRM Notes or SharePoint (configurable per
      form)
    - Azure AD / Entra ID authentication for portal users
    - Admin screens for managing form configuration (CRUD on metadata
      tables)
    - Full audit log of all submission events (create draft, update
      draft, submit, error)
    - Node.js + Express + TypeScript backend API as integration layer
      between React portal and Dataverse Web API
    - Sample form implementation: Loan Application with five tabs
      (Customer Information, Facility Details, Product Details,
      Documents, Declaration)
    - Unit, integration, and end-to-end test suites
    - Deployment configuration (Docker + GitHub Actions / Azure DevOps)

4.2 Out of Scope
    - Native mobile application (iOS / Android)
    - CRM plugin or custom code on the Dataverse server side beyond
      Power Automate triggers
    - A visual drag-and-drop form builder UI for the configuration team
      (configuration is done directly in Dataverse model-driven app
      or admin screens)
    - Integration with any third-party e-signature provider
    - SMS or email notification workflows (may be handled by Power
      Automate separately)
    - Offline / progressive web app capability
    - Multi-language / localisation beyond English (Phase 1)
    - Reporting or analytics dashboards on submission data
    - Direct database access — all data access is through Dataverse
      Web API
    - Dynamics 365 F&O or any ERP integration


5. FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────

5.1 Metadata Configuration Tables

FR-001: The system shall provide 12 Dataverse configuration tables to
        store form metadata, including at minimum: Form Definition,
        Tab, Section, Field, Field Option, Validation Rule, Conditional
        Rule, Submission Mapping, Lookup Source, Repeating Grid,
        Document Upload Config, and Audit Log.

FR-002: The system shall allow each Form Definition record to reference
        one or more Tab records, each Tab to reference one or more
        Section records, and each Section to reference one or more
        Field records.

FR-003: The system shall allow each Field record to specify its field
        type from the supported type set (see FR-010), display label,
        placeholder text, tooltip, default value, display order, and
        the Dataverse target attribute it maps to on submission.

FR-004: The system shall allow each Field record to be associated with
        zero or more Validation Rule records and zero or more
        Conditional Rule records independently.

FR-005: The system shall expose a versioned metadata API endpoint that
        returns the complete form definition JSON for a given Form ID,
        including all tabs, sections, fields, options, validation rules,
        and conditional rules in a single response payload.

5.2 Form Rendering

FR-006: The React portal shall render any form returned by the metadata
        API without requiring frontend code changes or redeployment.

FR-007: The system shall render multi-tab forms where each tab is
        displayed as a navigable tab control, and navigation between
        tabs is controlled by tab-level completion rules defined in
        metadata.

FR-008: The system shall render sections within each tab as collapsible
        or flat containers as specified per section metadata.

FR-009: The system shall render fields within each section in the order
        specified by the display order attribute in metadata.

FR-010: The system shall support rendering the following field types:
        text, textarea, number, date, datetime, dropdown (single
        select), multiselect, lookup (CRM entity search), checkbox,
        radio button group, currency, decimal, email, phone, file
        upload, repeating grid (dynamic row addition), and rich text
        editor.

FR-011: The system shall render lookup fields as type-ahead search
        inputs that query Dataverse via the backend API and display
        matching records from the configured entity and view.

FR-012: The system shall render repeating grid fields as a table where
        the user can add, edit, and delete rows, with each column
        defined as a child field in metadata.

5.3 Rule Engine

FR-013: The system shall evaluate conditional rules client-side in real
        time as field values change, without requiring a round-trip to
        the server.

FR-014: The system shall support the following conditional rule actions:
        show field, hide field, show section, hide section, show tab,
        hide tab, make field required, make field optional, make field
        read-only, set field value, clear field value, calculate field
        value using a configured expression, filter dropdown options,
        and filter lookup results.

FR-015: The system shall support the following conditional rule
        trigger conditions: field equals value, field not equals value,
        field is empty, field is not empty, field value greater than,
        field value less than, field value in list, and compound
        conditions using AND / OR operators.

FR-016: The system shall apply rule engine evaluation in the order
        specified by rule priority in metadata, and later rules shall
        not overwrite earlier rules of the same action type unless
        explicitly configured.

FR-017: The system shall re-evaluate all applicable rules when any
        field value changes, and update the visible state of all
        dependent fields, sections, and tabs accordingly.

5.4 Validation Engine

FR-018: The system shall validate form fields using validation rules
        stored in metadata, evaluated on field blur and on form
        submission attempt.

FR-019: The system shall support the following validation rule types:
        required, minimum length, maximum length, minimum value,
        maximum value, regex pattern match, email format, phone
        format, date must be before a specified date or field,
        date must be after a specified date or field, cross-field
        comparison (field A must equal/not equal field B), and custom
        JavaScript expression.

FR-020: The system shall display field-level validation error messages
        below the relevant field, using the message text configured in
        the Validation Rule record in Dataverse.

FR-021: The system shall prevent form submission when any validation
        rule in the required field set fails, and shall highlight the
        first failing tab and field to guide the user.

FR-022: The system shall evaluate Zod schemas generated at runtime from
        metadata validation rules, so that all validation is
        schema-driven and not hardcoded.

5.5 Save-as-Draft and Submission

FR-023: The system shall allow an authenticated portal user to save a
        partially completed form as a draft at any point, persisting
        all entered values to a Dataverse draft record associated with
        the form definition and the user's identity.

FR-024: The system shall allow an authenticated portal user to resume a
        previously saved draft by loading the draft record and
        pre-populating all form fields with the saved values.

FR-025: The system shall allow only one active draft per user per form
        definition. Attempting to start a new instance while a draft
        exists shall prompt the user to resume the existing draft or
        discard it and start fresh.

FR-026: The system shall perform a full validation pass across all tabs
        and sections before allowing final submission.

FR-027: On final submission, the system shall create parent and child
        CRM records in Dataverse as specified by the Submission Mapping
        configuration records for the form, mapping each form field
        value to its configured Dataverse attribute.

FR-028: On successful submission, the system shall trigger a Power
        Automate flow or CRM workflow as configured in the form
        definition, passing the created record ID as input.

FR-029: The system shall display a confirmation screen to the user
        after successful submission, showing the CRM record reference
        number as configured in the form definition.

FR-030: The system shall handle submission failures (network error,
        Dataverse API error) by preserving the entered data, displaying
        a user-friendly error message, and logging the error with
        full context to the audit log.

5.6 Document Upload

FR-031: The system shall support file upload fields as configured in
        the Document Upload Config table, including allowed MIME types,
        maximum file size, and upload destination (CRM Notes or
        SharePoint).

FR-032: The system shall upload documents to CRM Notes as an attachment
        on the parent submission record when the destination is
        configured as CRM Notes.

FR-033: The system shall upload documents to a SharePoint document
        library when the destination is configured as SharePoint, using
        the library URL and folder path specified in the Document Upload
        Config record.

FR-034: The system shall validate file type and file size on the client
        before initiating an upload, and display a clear error message
        if the file does not meet the configured constraints.

FR-035: The system shall display upload progress to the user and allow
        them to replace an uploaded file before final submission.

5.7 Authentication and Authorisation

FR-036: The system shall require users to authenticate via Azure AD /
        Entra ID using OAuth 2.0 PKCE flow before accessing any form
        or draft.

FR-037: The system shall pass the authenticated user's Azure AD token
        to the backend API on every request, and the backend API shall
        validate the token before proxying any Dataverse call.

FR-038: The system shall support form-level access control: a Form
        Definition record shall specify whether the form is accessible
        to all authenticated users or to a specific Azure AD group.

FR-039: The system shall deny access and display a permission error if
        an authenticated user attempts to access a form for which they
        do not have access rights.

5.8 Admin Configuration Screens

FR-040: The system shall provide admin screens (within the portal or
        as a model-driven Power App) for CRUD management of all 12
        Dataverse configuration tables.

FR-041: The system shall provide a form preview mode in the admin
        screens that renders the form as a portal user would see it,
        without saving any data to the submission tables.

FR-042: The admin screens shall be accessible only to users in the
        designated CRM Configuration Team Azure AD group.

FR-043: The system shall allow an administrator to activate or
        deactivate a Form Definition record, with deactivated forms
        returning a 404 response when accessed from the portal.

5.9 Audit Log

FR-044: The system shall write an audit log entry to the Audit Log
        Dataverse table for each of the following events: user
        authenticated, form opened, draft saved, draft resumed, draft
        discarded, form submitted (success), form submission failed,
        document uploaded, and admin configuration record changed.

FR-045: Each audit log entry shall record: event type, form definition
        ID, form definition name, user Azure AD object ID, user display
        name, timestamp (UTC), record ID affected (if applicable),
        and a JSON snapshot of changed data fields for configuration
        change events.

FR-046: The audit log table shall be append-only. The system shall
        never issue an UPDATE or DELETE against audit log records
        under any circumstances.

FR-047: The system shall expose a read-only audit log viewer in the
        admin screens, filterable by form, user, event type, and date
        range, accessible only to Compliance / Audit team members.


6. NON-FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────
NFR-001: Performance — The metadata API shall return the full form
         definition JSON for any form in under 500 ms at the 95th
         percentile under 100 concurrent users. The form shall be
         interactive (Time to Interactive) within 3 seconds on a
         standard broadband connection.

NFR-002: Performance — The lookup type-ahead search shall return
         matching results within 800 ms of the user stopping typing,
         under 100 concurrent users.

NFR-003: Availability — The portal and backend API shall maintain
         99.5% uptime during QDB business hours (06:00–22:00 Gulf
         Standard Time, Monday–Saturday).

NFR-004: Security — All API endpoints shall require a valid Azure AD
         JWT token. Tokens shall be validated for signature, audience,
         issuer, and expiry on every request. No endpoint shall be
         accessible without authentication.

NFR-005: Security — All data in transit shall be encrypted using
         TLS 1.2 or higher. No sensitive data shall be transmitted over
         unencrypted connections.

NFR-006: Security — No secrets, API keys, or Dataverse credentials
         shall be stored in frontend code or version control. Secrets
         shall be managed through Azure Key Vault or environment
         variables injected at deploy time.

NFR-007: Security — Input from form fields shall be sanitised and
         validated at the backend API boundary before being passed to
         Dataverse Web API, preventing injection attacks.

NFR-008: Scalability — The backend API shall be stateless and
         horizontally scalable. It shall support a minimum of 200
         concurrent users without degradation of NFR-001 thresholds.

NFR-009: Scalability — The Dataverse metadata tables shall support a
         minimum of 500 active form definitions and 10,000 field
         records without query performance degradation.

NFR-010: Compliance — All audit log entries shall be retained for a
         minimum of 7 years, in compliance with banking record-keeping
         regulations applicable to QDB's jurisdiction.

NFR-011: Compliance — The system shall not store any personally
         identifiable information (PII) outside of Dataverse. The
         React frontend shall hold PII only in memory (React state)
         during an active session and shall never persist PII to
         browser storage.

NFR-012: Maintainability — The codebase shall maintain a minimum of
         80% unit test coverage across backend API services. All public
         API contracts shall have integration tests.

NFR-013: Accessibility — The portal shall conform to WCAG 2.1 Level AA
         accessibility standards for all form controls and navigation
         elements.

NFR-014: Browser Support — The portal shall support the latest two
         versions of Chrome, Edge, Firefox, and Safari at the time of
         go-live.


7. BUSINESS RULES
─────────────────────────────────────────────────────────────────────
BR-001: A form may not be submitted if it has any active required
        validation failures on any field, regardless of whether
        the failing field is currently visible or hidden by the
        rule engine.

BR-002: A field that is hidden by the rule engine shall have its
        value cleared before submission mapping is executed, so that
        no stale hidden-field data is written to Dataverse.

BR-003: Only one active draft may exist per user per form definition
        at any given time.

BR-004: A draft record older than 90 days with no update activity
        shall be automatically flagged as expired and excluded from
        the resume flow. The expiry period is configurable per form
        definition.

BR-005: Document uploads shall be associated with the submission
        record, not the user record, to ensure documents are
        accessible to the assigned Relationship Manager in CRM.

BR-006: Submission mapping shall be executed as an atomic operation.
        If any parent or child record creation fails, all created
        records in that submission transaction shall be rolled back
        and the user shall be presented with a retriable error.

BR-007: A deactivated Form Definition shall not be accessible from
        the portal. Any direct URL to a deactivated form shall return
        a user-friendly "Form not available" page.

BR-008: The audit log shall record the pre-change and post-change
        state of any form configuration record modified by an admin,
        stored as a JSON diff in the audit log entry.

BR-009: Lookup fields shall only return active records from the
        configured Dataverse entity and view. Inactive records shall
        not appear in lookup results.

BR-010: Currency and decimal fields shall enforce the number of
        decimal places specified in the field metadata, and shall
        reject input that exceeds the configured precision.

BR-011: File uploads shall be rejected if the file size exceeds the
        maximum configured for that field. The maximum file size per
        field shall not exceed 25 MB.

BR-012: The Power Automate / workflow trigger on submission shall be
        fire-and-forget from the portal's perspective. Trigger failure
        shall be logged but shall not cause the submission to fail or
        be retried by the portal.


8. USER STORIES
─────────────────────────────────────────────────────────────────────

US-01
  As a CRM Configuration Team member, I want to define a new form
  with its tabs, sections, and fields entirely in Dataverse so that
  the form appears on the portal without requiring a code deployment.
  Priority: Must Have
  Acceptance Criteria:
    Given a complete Form Definition, Tab, Section, and Field set
      has been created in Dataverse
    When a portal user navigates to the form's URL
    Then the form is rendered with all configured tabs, sections,
      and fields in the correct order, matching the metadata exactly.

US-02
  As a CRM Configuration Team member, I want to configure conditional
  rules that show or hide fields based on other field values so that
  the form guides users through only the questions relevant to their
  situation.
  Priority: Must Have
  Acceptance Criteria:
    Given a conditional rule is configured to hide Field B when
      Field A equals "No"
    When a portal user sets Field A to "No"
    Then Field B is immediately hidden without a page reload,
      and its value is cleared before submission.

US-03
  As a CRM Configuration Team member, I want to configure validation
  rules on fields so that portal users cannot submit incomplete or
  invalid data.
  Priority: Must Have
  Acceptance Criteria:
    Given a required validation rule is configured on a field
    When a portal user attempts to submit the form with that field
      empty
    Then submission is blocked and an error message (as configured
      in the rule record) is displayed below the field.

US-04
  As a Portal User (bank customer), I want to save my partially
  completed form as a draft so that I can return and complete it
  later without losing my progress.
  Priority: Must Have
  Acceptance Criteria:
    Given a portal user has partially completed a form
    When the user clicks "Save as Draft"
    Then all entered values are persisted to Dataverse, a
      confirmation message is shown, and the user can later resume
      the form with all values pre-populated.

US-05
  As a Portal User (bank customer), I want the form to validate my
  inputs in real time and show me clear error messages so that I can
  correct mistakes before submitting.
  Priority: Must Have
  Acceptance Criteria:
    Given a field with an email format validation rule
    When a portal user enters an invalid email address and moves
      focus away from the field
    Then the configured error message is displayed immediately
      below the field without requiring a submit attempt.

US-06
  As a Portal User (bank customer), I want to upload supporting
  documents as part of my form submission so that I do not need to
  submit them through a separate channel.
  Priority: Must Have
  Acceptance Criteria:
    Given a file upload field configured for PDF and JPEG up to
      10 MB
    When a portal user uploads a valid PDF file
    Then the file is displayed as uploaded, and on final submission
      the document is attached to the CRM submission record as
      configured.

US-07
  As a Relationship Manager, I want to receive a complete, structured
  CRM record when a customer submits a form so that I can process the
  application without re-entering data.
  Priority: Must Have
  Acceptance Criteria:
    Given a form submission mapping is configured to create an
      Opportunity record and associated Contact record
    When a portal user completes and submits the form
    Then an Opportunity and a linked Contact record are created
      in Dataverse with all mapped field values populated correctly.

US-08
  As a Relationship Manager, I want a Power Automate flow to be
  triggered when a form is submitted so that I am notified
  automatically and the application enters the correct processing
  pipeline.
  Priority: Must Have
  Acceptance Criteria:
    Given a Power Automate flow is configured on the Form Definition
    When a portal user successfully submits the form
    Then the Power Automate flow is triggered with the created
      record ID within 60 seconds of submission.

US-09
  As a Compliance / Audit team member, I want a tamper-proof audit
  log of all form submission events so that I can demonstrate
  regulatory compliance during audits.
  Priority: Must Have
  Acceptance Criteria:
    Given a portal user has submitted a form
    When an Audit team member views the audit log
    Then a complete record exists showing the user identity,
      timestamp, form definition, submission event, and the ID of
      the created CRM record, and no audit record can be edited
      or deleted.

US-10
  As an IT / DevOps team member, I want the portal to be deployable
  as a Docker container with a GitHub Actions pipeline so that
  deployments are consistent and repeatable across environments.
  Priority: Must Have
  Acceptance Criteria:
    Given a tagged release is pushed to the main branch
    When the GitHub Actions pipeline runs
    Then a Docker image is built, tested, and pushed to the
      container registry, and the portal is deployed to the target
      environment without manual steps.

US-11
  As a CRM Configuration Team member, I want to preview a form in
  the admin screens before activating it so that I can verify the
  rendering and rule behaviour before customers see it.
  Priority: Should Have
  Acceptance Criteria:
    Given a Form Definition is in draft status
    When an admin selects "Preview" in the admin screen
    Then the form is rendered exactly as it would appear to a
      portal user, with no data written to submission tables.

US-12
  As a Portal User, I want to search for and select a related CRM
  record in a lookup field so that I can link my submission to an
  existing account or contact without typing the full ID.
  Priority: Must Have
  Acceptance Criteria:
    Given a lookup field configured against the Account entity
    When a portal user types at least 3 characters
    Then matching active Account records are shown in a dropdown
      within 800 ms, and selecting one populates the field with
      the record name and stores the record GUID for submission.


9. DATA REQUIREMENTS
─────────────────────────────────────────────────────────────────────
| Entity                  | Est. Volume (Year 1) | Retention     | Sensitivity    |
|-------------------------|----------------------|---------------|----------------|
| Form Definition         | 50 records           | Indefinite    | Internal       |
| Tab                     | 250 records          | Indefinite    | Internal       |
| Section                 | 1,000 records        | Indefinite    | Internal       |
| Field                   | 10,000 records       | Indefinite    | Internal       |
| Field Option            | 50,000 records       | Indefinite    | Internal       |
| Validation Rule         | 20,000 records       | Indefinite    | Internal       |
| Conditional Rule        | 15,000 records       | Indefinite    | Internal       |
| Submission Mapping      | 5,000 records        | Indefinite    | Internal       |
| Lookup Source Config    | 500 records          | Indefinite    | Internal       |
| Document Upload Config  | 200 records          | Indefinite    | Internal       |
| Draft Submission        | 5,000 active drafts  | 90 days       | Confidential   |
| Audit Log Entry         | 500,000/year         | 7 years       | Restricted     |
| Submitted Form Records  | 10,000/year          | 7 years       | Confidential   |
| Uploaded Documents      | 30,000/year          | 7 years       | Confidential   |


10. INTEGRATION DEPENDENCIES
─────────────────────────────────────────────────────────────────────
| System                       | Integration Type        | Data Exchanged                                      | Direction              |
|------------------------------|-------------------------|-----------------------------------------------------|------------------------|
| Microsoft Dataverse / CRM    | REST (OData Web API)    | Form metadata, submissions, drafts, audit log        | Bidirectional          |
| Azure AD / Entra ID          | OAuth 2.0 PKCE          | Authentication tokens, user identity claims          | Inbound to portal      |
| Power Automate               | Dataverse plugin/trigger| Submission record ID and metadata on form submit     | Outbound from Dataverse|
| SharePoint Online            | REST API (Graph)        | Document file upload, folder creation                | Outbound from backend  |
| Azure Key Vault              | REST / SDK              | API secrets, Dataverse client credentials            | Inbound to backend     |
| Container Registry (ACR)     | Docker push/pull        | Portal and API Docker images                         | Outbound from pipeline |


11. ASSUMPTIONS
─────────────────────────────────────────────────────────────────────
A-001: QDB already has a Microsoft Dataverse / Dynamics CRM Online
       environment provisioned and accessible via Dataverse Web API.

A-002: QDB's Azure AD / Entra ID tenant is configured and an app
       registration for the portal will be provided by QDB IT.

A-003: The 12 Dataverse configuration tables will be created as
       custom entities in QDB's Dataverse environment by the Maqsad
       AI team, with QDB's approval and environment access.

A-004: The CRM Configuration Team has the necessary Dataverse licences
       and permissions to create and modify configuration records.

A-005: Power Automate flows triggered on submission will be designed
       and maintained by QDB's CRM team. The portal only triggers
       them; it does not own them.

A-006: SharePoint Online is available and the backend API service
       principal will be granted write permissions to the relevant
       document libraries by QDB IT.

A-007: The portal will be hosted on Azure (Azure App Service or AKS),
       with infrastructure provisioning managed by QDB IT and
       deployment scripts provided by Maqsad AI.

A-008: The Loan Application form is the first form to be fully
       configured in metadata as the reference implementation and
       UAT vehicle.

A-009: Fluent UI (Microsoft) is the preferred component library given
       the Microsoft technology ecosystem context, unless QDB specifies
       otherwise.

A-010: All users (bank customers and internal staff) will authenticate
       through the same Azure AD tenant. Guest / B2C scenarios are out
       of scope for Phase 1.


12. CONSTRAINTS
─────────────────────────────────────────────────────────────────────
C-001: The frontend must use ReactJS + TypeScript as the UI framework.
       No other frontend framework may be introduced without an ADR.

C-002: The backend must use Node.js + Express + TypeScript. No other
       server-side runtime may be introduced without an ADR.

C-003: All CRM data access must go through the Dataverse Web API
       (OData). Direct SQL access to the underlying CRM database is
       not permitted.

C-004: Dataverse Web API throttling limits (per Microsoft licensing)
       must be respected. Bulk operations must implement retry logic
       with exponential back-off.

C-005: The solution must operate within QDB's existing Azure tenant
       and is subject to QDB's information security policies, including
       data residency requirements (data must remain in the Qatar Azure
       region).

C-006: The audit log must comply with Qatar Central Bank (QCB) and
       any applicable FATF record-keeping guidance for banking
       institutions.

C-007: The project timeline is constrained by QDB's target go-live of
       Q3 2026. The Loan Application form must be live in UAT by end
       of Q2 2026.

C-008: Azure AD app registration and SharePoint permissions are
       provisioned by QDB IT; delays in provisioning are a delivery
       risk outside Maqsad AI's control.


13. RISKS AND OPEN QUESTIONS
─────────────────────────────────────────────────────────────────────
| Risk / Question                                                            | Impact | Owner              | Resolution Needed By |
|----------------------------------------------------------------------------|--------|--------------------|----------------------|
| Dataverse Web API throttling under peak load may breach performance SLA    | High   | IT / DevOps        | Architecture phase   |
| QDB IT delays in providing Azure AD app registration                       | High   | QDB IT             | Sprint 1 start       |
| SharePoint document library structure and permissions not yet defined       | Medium | QDB CRM Team       | Sprint 2 start       |
| 12 Dataverse configuration table schema requires QDB environment access    | High   | Maqsad AI / QDB IT | Before development   |
| Custom expression validation (FR-019) scope and syntax not fully defined    | Medium | BA / CRM Team      | Before FR sign-off   |
| Power Automate trigger design and data contract not agreed with CRM team   | Medium | QDB CRM Team       | Sprint 3 start       |
| WCAG 2.1 AA compliance for rich text editor component — library selection  | Low    | Frontend Dev       | Architecture phase   |
| Data residency verification: all Azure services must be Qatar region        | High   | QDB IT             | Before deployment    |
| QCB record-keeping regulation specifics for the audit log format           | Medium | Compliance / QDB   | Before build start   |
| Draft expiry cleanup process — automated job or manual CRM process?        | Low    | Maqsad AI / QDB    | Architecture phase   |


14. GLOSSARY
─────────────────────────────────────────────────────────────────────
Dataverse          Microsoft cloud database platform underlying
                   Dynamics 365 and Power Platform. Accessed via
                   OData Web API.

Form Definition    The root metadata record in Dataverse that
                   describes a single portal form, its tabs, and its
                   submission mapping configuration.

Metadata           Configuration data stored in Dataverse that
                   describes form structure, field behaviour,
                   validation rules, and submission mappings.

Rule Engine        The client-side subsystem in the React portal
                   that evaluates conditional rules and updates field
                   visibility, required state, and values in real time.

Validation Engine  The subsystem (client-side and server-side) that
                   evaluates validation rules against field values and
                   determines whether a form may be submitted.

Submission Mapping A Dataverse configuration record that defines which
                   Dataverse entity and attribute a form field value
                   should be written to on submission.

Draft              A partially completed form saved to Dataverse,
                   associated with a specific user and form definition,
                   which can be resumed.

Repeating Grid     A field type that renders as a dynamic table where
                   users can add multiple rows, each row containing
                   the same set of child fields.

Lookup Field       A field type that allows the user to search for
                   and select an existing Dataverse record.

CRM Notes          Dataverse Note (annotation) entity used to attach
                   documents to a parent CRM record.

Power Automate     Microsoft's cloud workflow automation platform,
                   used to trigger downstream processing on form
                   submission.

Entra ID           Microsoft Azure Active Directory — the identity
                   platform used for portal authentication.

PKCE               Proof Key for Code Exchange — OAuth 2.0 extension
                   for securing authorisation code flows in public
                   clients (SPAs).

QDB                Qatar Development Bank — the client organisation
                   commissioning this portal.

OData              Open Data Protocol — the REST-based API standard
                   used by Dataverse Web API.

Fluent UI          Microsoft's open-source React component library
                   aligned with Microsoft design system.


15. REQUIREMENTS TRACEABILITY MATRIX
─────────────────────────────────────────────────────────────────────
| User Story | Functional Requirements                        | Business Objective | Test Cases                        | Status  |
|------------|------------------------------------------------|--------------------|-----------------------------------|---------|
| US-01      | FR-001, FR-002, FR-003, FR-006, FR-007, FR-008, FR-009 | BO-001 | TC-022, TC-035–041, TC-042–046   | Defined |
| US-02      | FR-013, FR-014, FR-015, FR-016, FR-017         | BO-001, BO-002     | TC-001–010, TC-049                | Defined |
| US-03      | FR-018, FR-019, FR-020, FR-021, FR-022         | BO-002             | TC-011–021, TC-050                | Defined |
| US-04      | FR-023, FR-024, FR-025                         | BO-002             | TC-048, TC-067, TC-068            | Defined |
| US-05      | FR-018, FR-019, FR-020                         | BO-002             | TC-014, TC-015, TC-050            | Defined |
| US-06      | FR-031, FR-032, FR-033, FR-034, FR-035         | BO-002, BO-003     | TC-052, TC-071                    | Defined |
| US-07      | FR-026, FR-027, FR-028, FR-029                 | BO-003             | TC-029, TC-030                    | Defined |
| US-08      | FR-028                                         | BO-003             | TC-031, TC-075                    | Defined |
| US-09      | FR-044, FR-045, FR-046, FR-047                 | BO-004             | TC-032, TC-033, TC-064            | Defined |
| US-10      | (DevOps — no FR; covered by NFR-001–014)       | BO-005             | TC-054–057                        | Defined |
| US-11      | FR-040, FR-041, FR-042, FR-043                 | BO-006             | TC-070                            | Defined |
| US-12      | FR-010, FR-011                                 | BO-002             | TC-051, TC-074                    | Defined |


16. APPROVAL
─────────────────────────────────────────────────────────────────────
| Role              | Name              | Decision              | Date       |
|-------------------|-------------------|-----------------------|------------|
| CEO               | Maqsad AI — CEO   | APPROVED (6 conditions)| 2026-05-08|
| Requestor (QDB)   | Pending           | PENDING               |            |
| BA                | Maqsad AI — BA    | SUBMITTED             | 2026-05-08 |

═══════════════════════════════════════════════════
END OF DOCUMENT — v1.0
═══════════════════════════════════════════════════


═══════════════════════════════════════════════════
BRD ADDENDUM — FEATURE MODULE: INFO-CARD SCREENS
═══════════════════════════════════════════════════
Addendum Reference: DFE-ADD-001
Parent BRD:         Dynamic Form Engine Portal — QDB (v1.0)
Prepared by:        Maqsad AI — Business Analyst
Date:               2026-06-04
Version:            1.0
Status:             READY FOR CEO REVIEW — All open questions resolved 2026-06-05
Numbering:          FRs continue from FR-048. NFRs from NFR-015.
                    BRs from BR-013. USs from US-13.
═══════════════════════════════════════════════════


A1. FEATURE OVERVIEW
─────────────────────────────────────────────────────────────────────
Currently the Dynamic Form Engine presents users with an input form
immediately upon opening. There is no mechanism to orient users before
they begin entering data. Stakeholders have requested that a form flow
may optionally begin with one or more read-only informational screens
— referred to here as Info-Card Screens — that present contextual
content (icons, headings, supporting detail, and descriptive body
text) before the first data-entry tab is shown.

An Info-Card Screen is not a form tab. It contains no input fields and
collects no data. Its sole purpose is to communicate information to the
user: what the form is about, what documents to prepare, what
eligibility criteria apply, what the user should expect during the
process, or any other guidance the form author chooses to display.

Multiple Info-Card Screens may appear in sequence, each advancing to
the next via a "Next" navigation action, until the final screen
transitions the user to the first tab of the main form. Info-Card
Screens are entirely metadata-driven: form authors define them in
Dataverse alongside the rest of the form configuration, with no code
changes required to add, reorder, or remove them.

This feature directly supports Business Objectives BO-001 (self-service
form configuration) and BO-002 (improved user guidance and completion
rates).


A2. ADDITIONAL BUSINESS OBJECTIVES
─────────────────────────────────────────────────────────────────────
BO-007: Enable the CRM Configuration Team to prepend one or more
        read-only informational screens to any form so that portal
        users are contextually guided before data entry begins,
        reducing incomplete submissions caused by unpreparedness.

BO-008: Enable Portal Users (bank customers) to understand what a
        form requires — including required documents, eligibility
        criteria, and process steps — before committing to filling
        it in, so that form abandonment due to missing information
        is reduced.


A3. SCOPE
─────────────────────────────────────────────────────────────────────

A3.1 In Scope
     - A new screen type called an Info-Card Screen, distinct from
       tabs, sections, and fields, rendered before the form's first
       data-entry tab.
     - Support for multiple ordered Info-Card Screens per form
       definition.
     - Info-Card Screen composition: icon (image URL), heading,
       sub-heading/intro text — all configured in Dataverse metadata.
     - Structured body content composed of one or more Info-Card
       Sections, each with a section title and section type.
     - Three section types: numbered steps, icon list, download list.
     - Info-Card Items within each section, each with an icon, title,
       description, and optional external download URL.
     - Download action that opens an external URL (SharePoint or
       other external document link) in a new browser tab.
     - Optional callout/note block per section.
     - Sequential forward and backward navigation between Info-Card
       Screens, with "Continue" on intermediate screens and "Start"
       on the final screen.
     - Transition from the last Info-Card Screen to the first
       data-entry tab via the existing form navigation flow.
     - Scrollable screen body for screens with large content.
     - Optional skip capability per Info-Card Screen sequence
       (configurable per form definition).
     - Integration of Info-Card Screens into the form progress
       indicator, with configuration controlling whether they
       are counted.
     - Three new Dataverse entities: qdb_info_card_screen,
       qdb_info_card_section, and qdb_info_card_item, and their
       relationships to the existing qdb_form_definition entity.
     - Admin screen support for CRUD management of all three new
       entity records (extending FR-040).
     - Mobile-responsive rendering of Info-Card Screens.
     - WCAG 2.1 Level AA accessibility for all Info-Card Screen
       content and navigation controls.
     - Audit log entries for Info-Card Screen view events (extending
       FR-044).

A3.2 Out of Scope
     - Info-Card Screens that contain any form input fields, text
       inputs, dropdowns, checkboxes, or any other data-entry
       control.
     - Video or audio content within Info-Card Screens (static
       image icons only in this release).
     - Rich-text HTML authoring in the description body
       (plain text and line breaks only in this release).
     - Branching or conditional logic that changes which Info-Card
       Screens are shown based on user-provided data (no data has
       been entered at this stage of the flow).
     - Standalone Info-Card Screens that are not linked to a form
       definition (e.g. a stand-alone help page).
     - Personalisation of Info-Card content based on the
       authenticated user's profile or role.
     - Analytics or engagement tracking on individual Info-Card
       Screens (e.g. time-on-screen, completion rate per screen).
     - Animated transitions between Info-Card Screens.
     - PDF or printable export of Info-Card content.


A4. FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────

A4.1 Info-Card Screen Definition (Metadata)

FR-048: The system shall support a new screen type, Info-Card Screen,
        that is associated with a Form Definition record and rendered
        before the form's first data-entry tab when one or more
        Info-Card Screen records exist for that form.

FR-049: The system shall read Info-Card Screen records from a dedicated
        Dataverse entity (qdb_info_card_screen) at the same time it
        reads the full form definition metadata, with no additional
        API round-trip.

FR-050: Each Info-Card Screen record shall store: a display order
        integer, an icon image URL (resolving to an externally hosted
        or SharePoint-hosted illustration), an icon alt text string
        (required, maximum 200 characters, for accessibility), a
        heading (short title, maximum 120 characters), and an optional
        sub-heading or intro text (maximum 300 characters). The body
        content of the screen is provided by one or more associated
        Info-Card Section records, not by a flat description field on
        the screen record itself.

FR-051: The system shall render Info-Card Screens in ascending display
        order as defined by the display order attribute on each record.
        Two records with the same display order value shall be sorted
        alphabetically by heading as a tiebreaker.

FR-052: The system shall allow a Form Definition record to have zero
        or more associated Info-Card Screen records. A form with zero
        Info-Card Screen records shall launch directly into the first
        data-entry tab, with no change to existing behaviour.

A4.2 Info-Card Screen Rendering

FR-053: The system shall render each Info-Card Screen as a distinct
        full-page scrollable view within the form flow. The screen
        layout shall present, from top to bottom: the icon image,
        the heading, the sub-heading/intro text (if present), and
        then all Info-Card Sections in ascending display order.

FR-054: The system shall render the screen icon as an image element
        using the icon image URL stored in the screen record. The
        image element shall use the icon alt text attribute as its
        alt value. If the icon image URL is absent, no icon element
        shall be rendered and no layout gap shall appear in its place.

FR-055: The system shall render the screen heading as an H1-level
        element on the Info-Card Screen page so that it is the
        primary heading in the document outline for screen reader
        users.

FR-056: The system shall render the sub-heading/intro text, when
        present, as a paragraph element immediately below the H1
        heading, styled distinctly from body text to establish
        visual hierarchy.

FR-057: The system shall render Info-Card Sections below the
        sub-heading/intro text in ascending display order. Each
        section shall render its section title (if present) as an
        H2-level element followed by its items.

FR-058: The system shall render no form input controls, no validation
        messages, no save-as-draft button, and no submission controls
        on any Info-Card Screen.

A4.3 Navigation Between Info-Card Screens

FR-059: The system shall display a "Continue" navigation button on
        every Info-Card Screen that is not the last in the sequence.
        Clicking "Continue" shall advance the user to the next
        Info-Card Screen in display order.

FR-060: The system shall display a "Back" navigation button on every
        Info-Card Screen that is not the first in the sequence.
        Clicking "Back" shall return the user to the previous Info-Card
        Screen in display order. The "Back" button shall be absent or
        visually disabled on the first Info-Card Screen.

FR-061: The system shall display a "Start" button on the final
        Info-Card Screen in the sequence. Clicking "Start" shall
        transition the user to the first data-entry tab of the form.

FR-062: The system shall not apply any tab-completion validation when
        the user navigates between Info-Card Screens or transitions
        from the last Info-Card Screen to the first data-entry tab,
        because no data has been entered at this stage.

A4.4 Skip Behaviour

FR-063: The system shall support a skip configuration flag on the
        Form Definition record (qdb_allow_infocard_skip, boolean).
        When this flag is true, the system shall display a "Skip"
        or "Skip Introduction" link on all Info-Card Screens.

FR-064: When the user activates the skip control, the system shall
        immediately navigate the user to the first data-entry tab,
        bypassing all remaining Info-Card Screens.

FR-065: When the skip configuration flag is false or absent on the
        Form Definition record, the system shall not display a skip
        control on any Info-Card Screen, and the user must advance
        through all screens sequentially.

A4.5 Progress Indicator

FR-066: The system shall support a progress indicator configuration
        flag on the Form Definition record
        (qdb_infocard_counts_in_progress, boolean) that controls
        whether Info-Card Screens are included in the progress bar
        step count shown to the user.

FR-067: When qdb_infocard_counts_in_progress is true, the system shall
        include each Info-Card Screen as a numbered step in the
        progress indicator, with Info-Card steps rendered as
        read-only (non-clickable) steps preceding the form tab steps.

FR-068: When qdb_infocard_counts_in_progress is false or absent, the
        system shall not include Info-Card Screens in the progress
        indicator step count. The progress bar shall only reflect
        data-entry tab progress as per existing behaviour.

A4.6 Mobile Responsiveness

FR-069: The system shall render Info-Card Screens responsively across
        all supported viewport sizes. On viewports below 768 px width,
        the icon shall be displayed above the heading in a single-
        column stacked layout. On viewports 768 px and above, the
        layout may use a side-by-side or centred single-column
        presentation as defined in the UI design phase.

FR-070: The "Next", "Back", "Get Started", and "Skip" controls on
        Info-Card Screens shall have a minimum touch target size of
        44 x 44 CSS pixels on mobile viewports, in compliance with
        WCAG 2.1 Success Criterion 2.5.5.

A4.7 Accessibility

FR-071: Each Info-Card Screen shall have a unique, descriptive page
        title (rendered in the HTML <title> element) composed of the
        screen heading and the form definition name, so that screen
        reader users can identify the current screen when it loads.

FR-072: The system shall implement focus management on Info-Card Screen
        transitions: when a new Info-Card Screen is rendered following
        a "Next" or "Back" action, keyboard focus shall be moved to
        the screen's H1 heading element.

FR-073: All navigation controls on Info-Card Screens ("Next", "Back",
        "Get Started", "Skip") shall be implemented as native button
        elements or anchor elements with appropriate ARIA roles, and
        shall be fully operable via keyboard without a mouse.

A4.8 Admin Configuration

FR-074: The system shall allow CRM Configuration Team members to
        create, read, update, and delete Info-Card Screen records
        from within the existing admin configuration screens (extending
        the capability described in FR-040), with the same access
        control restrictions (FR-042).

FR-075: The existing form preview mode (FR-041) shall render Info-Card
        Screens as the first screens in the preview flow, so that
        administrators can verify Info-Card content and navigation
        before activating the form.

A4.9 Audit Logging

FR-076: The system shall write an audit log entry of event type
        "info_card_screen_viewed" to the Audit Log table each time a
        user views an Info-Card Screen, recording the form definition
        ID, screen record ID, display order position, user identity,
        and timestamp (UTC).

A4.10 Info-Card Sections

FR-077: Each Info-Card Screen shall support one or more associated
        Info-Card Section records (qdb_info_card_section), ordered
        by a display order integer. A screen with no section records
        shall render only its icon, heading, and sub-heading with no
        body content below.

FR-078: Each Info-Card Section record shall store: a display order
        integer, an optional section title (maximum 100 characters),
        a section type (one of: numbered-steps, icon-list,
        download-list), and an optional note/callout text (maximum
        500 characters).

FR-079: The system shall render Info-Card Sections according to
        their section type:
        - numbered-steps: items rendered as a vertically stacked
          numbered list (1, 2, 3…), each item showing its number,
          title, and description.
        - icon-list: items rendered as a vertically stacked list,
          each item showing a small icon, title, and description.
        - download-list: items rendered as a vertically stacked list,
          each item showing a document icon, title, and a download
          action control. The description field is optional and shown
          as sub-text beneath the title.

FR-080: When a section has a note/callout text value, the system
        shall render a visually distinct callout block at the bottom
        of that section, displaying the note text. The callout block
        shall not be rendered if the note/callout text is absent.

A4.11 Info-Card Items

FR-081: Each Info-Card Section shall support one or more associated
        Info-Card Item records (qdb_info_card_item), ordered by a
        display order integer.

FR-082: Each Info-Card Item record shall store: a display order
        integer, an item title (maximum 120 characters), an optional
        description (maximum 500 characters), an optional icon
        reference (named icon key from a system icon library or image
        URL), and an optional download URL (absolute URL string,
        maximum 1,000 characters).

FR-083: For items within a download-list section, the system shall
        render a download action control (icon button or labelled
        link) alongside the item title. Activating the download
        control shall open the item's download URL in a new browser
        tab. If the download URL is absent on a download-list item,
        the download control shall be hidden and no action shall
        be triggered.

FR-084: Download URLs stored on Info-Card Items shall be treated as
        external references (SharePoint document links or other
        external URLs). The system shall not proxy, validate, or
        cache these URLs. The system shall open them in a new tab
        using a rel="noopener noreferrer" anchor to prevent
        opener-based security vulnerabilities.

FR-085: The system shall render the Info-Card Screen body as a
        vertically scrollable container when the combined height of
        all sections and items exceeds the available viewport height,
        ensuring all content is reachable without horizontal
        scrolling on any supported viewport width.

A4.12 Admin Configuration — Sections and Items

FR-086: The system shall allow CRM Configuration Team members to
        create, read, update, and delete Info-Card Section records
        and Info-Card Item records from within the existing admin
        configuration screens, with the same access control
        restrictions (FR-042).

FR-087: The admin configuration screen shall enforce that each
        Info-Card Item belonging to a download-list section must
        have either a download URL or a description, and shall
        display a validation warning if neither is present on save.
        When a download URL is provided, the system shall validate
        that the value is an absolute HTTPS URL at admin save time
        and shall reject the save with a descriptive error message
        if the URL uses HTTP, is missing a scheme, or is not
        well-formed. (CEO condition ADD-001-C3)


A5. NON-FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────
NFR-015: Performance — Each Info-Card Screen shall be rendered and
         interactive within 500 ms of the user activating the "Next"
         or "Back" navigation control, measured on a standard
         broadband connection. No server round-trip is required
         between Info-Card Screen transitions; all screen data is
         included in the initial metadata payload (FR-049).

NFR-016: Read-Only Guarantee — The Info-Card Screen rendering layer
         shall contain no form input controls, no write API calls,
         no draft-save logic, and no validation engine invocation.
         A static analysis gate (enforced in code review) shall
         confirm that no data-mutation path exists within the
         Info-Card Screen component tree.

NFR-017: Accessibility — Info-Card Screens shall meet WCAG 2.1 Level
         AA, specifically: sufficient colour contrast for heading and
         body text (SC 1.4.3), keyboard navigability of all controls
         (SC 2.1.1), focus visibility (SC 2.4.7), and descriptive
         labels on all icon elements (SC 1.1.1). This extends the
         NFR-013 commitment to this new screen type.

NFR-018: Scalability — The qdb_info_card_screen entity shall support
         a minimum of 20 Info-Card Screen records per Form Definition,
         and a minimum of 1,000 Info-Card Screen records in total
         across all form definitions, without degradation of metadata
         API response time beyond the NFR-001 threshold.


A6. BUSINESS RULES
─────────────────────────────────────────────────────────────────────
BR-013: An Info-Card Screen shall never contain, render, or accept
        any form input. No field value shall be read from or written
        to any Info-Card Screen at any point in the user flow.

BR-014: Info-Card Screens belong exclusively to a single Form
        Definition. They cannot be shared or reused across multiple
        Form Definition records. If the same content is needed on
        multiple forms, a separate Info-Card Screen record must be
        created for each form.

BR-015: If a Form Definition has one or more active Info-Card Screen
        records, the portal shall always present them before the first
        data-entry tab, except when the user has explicitly activated
        the skip control (if skip is enabled on that form definition).
        The portal shall not allow a user to reach the first data-entry
        tab without either completing or skipping the Info-Card
        sequence.

BR-016: A deactivated Info-Card Screen record (status = Inactive in
        Dataverse) shall be excluded from the rendered sequence and
        shall not be counted in progress indicators or skip logic.
        Deactivation is the required method for removing a screen from
        the flow without deleting the record.

BR-017: The display order values within a single Form Definition's
        Info-Card Screen records must be unique. The admin screen
        shall validate uniqueness on save and prevent duplicate
        display order values from being committed.


A7. USER STORIES
─────────────────────────────────────────────────────────────────────

US-13
  As a CRM Configuration Team member, I want to add one or more
  Info-Card Screens to a form definition in Dataverse so that portal
  users see contextual guidance before they begin entering data.
  Priority: Must Have
  Acceptance Criteria:
    Given one or more Info-Card Screen records are created and
      associated with a Form Definition record in Dataverse
    When a portal user navigates to that form's URL
    Then the first Info-Card Screen is displayed before any
      data-entry tab is shown, with the icon, heading, sub-heading,
      and description body rendered as configured.

US-14
  As a Portal User (bank customer), I want to read through
  informational screens before I start filling in a form so that
  I understand what the form requires and I have everything I need
  to complete it.
  Priority: Must Have
  Acceptance Criteria:
    Given a form has three Info-Card Screens configured in display
      order 1, 2, 3
    When the portal user opens the form
    Then screen 1 is shown first; clicking "Next" shows screen 2;
      clicking "Next" again shows screen 3; clicking "Get Started"
      on screen 3 opens the first data-entry tab of the form.

US-15
  As a Portal User (bank customer), I want to navigate back through
  Info-Card Screens I have already read so that I can review
  information I may have missed.
  Priority: Must Have
  Acceptance Criteria:
    Given the portal user is on Info-Card Screen 2 of 3
    When the user clicks "Back"
    Then Info-Card Screen 1 is displayed, and clicking "Back" again
      on screen 1 does not navigate away from the Info-Card sequence
      (the "Back" button is absent or disabled on the first screen).

US-16
  As a Portal User (bank customer), I want to skip the informational
  screens when they are enabled for skipping so that I can reach the
  form immediately if I have already read the information before.
  Priority: Should Have
  Acceptance Criteria:
    Given a form definition has qdb_allow_infocard_skip set to true
    When the portal user is on any Info-Card Screen and activates
      the "Skip" control
    Then the portal navigates directly to the first data-entry tab,
      bypassing all remaining Info-Card Screens.

US-17
  As a CRM Configuration Team member, I want to preview Info-Card
  Screens in the admin form preview so that I can verify the content
  and navigation flow before activating the form for portal users.
  Priority: Must Have
  Acceptance Criteria:
    Given a Form Definition has Info-Card Screens configured
    When an admin activates the form preview mode
    Then the preview begins with the first Info-Card Screen and
      allows the admin to navigate through all screens and into
      the form tabs, with no data written to submission tables.


A8. DATA MODEL — NEW DATAVERSE ENTITIES
─────────────────────────────────────────────────────────────────────

The Info-Card feature introduces a three-level entity hierarchy:
  qdb_form_definition (existing)
    └── qdb_info_card_screen        (new — one record per screen in sequence)
          └── qdb_info_card_section  (new — one record per content group)
                └── qdb_info_card_item (new — one record per line item)

A8.1 New Entity: qdb_info_card_screen

  Purpose: Stores the header-level definition of a single Info-Card
           Screen (icon image URL, heading, intro text, display order).

  | Attribute               | Type         | Description                                                  |
  |-------------------------|--------------|--------------------------------------------------------------|
  | qdb_info_card_screenid  | GUID (PK)    | Unique identifier                                            |
  | qdb_name                | String(200)  | Internal admin label (not shown to portal users)             |
  | qdb_form_definition_id  | Lookup       | N:1 to qdb_form_definition (required, cascade delete)        |
  | qdb_display_order       | Integer      | Ascending sort order within the form definition (required)   |
  | qdb_icon_url            | String(1000) | Absolute URL to the screen illustration/icon image (optional)|
  | qdb_icon_alt_text       | String(200)  | Accessible alt text for the icon (required when URL is set)  |
  | qdb_heading             | String(120)  | Primary H1 heading shown on screen (required)                |
  | qdb_sub_heading         | String(300)  | Intro text shown below the heading (optional)                |
  | statecode               | Picklist     | Active / Inactive — inactive screens excluded from flow      |
  | createdon / createdby   | System       | Audit columns                                                |
  | modifiedon / modifiedby | System       | Audit columns                                                |

A8.2 New Entity: qdb_info_card_section

  Purpose: Stores one content group within an Info-Card Screen.
           A screen may have multiple sections ordered by display_order
           (e.g. "Details to Enter", "Documents to Upload",
           "Forms to Download & Fill").

  | Attribute                | Type        | Description                                                   |
  |--------------------------|-------------|---------------------------------------------------------------|
  | qdb_info_card_sectionid  | GUID (PK)   | Unique identifier                                             |
  | qdb_name                 | String(200) | Internal admin label                                          |
  | qdb_info_card_screen_id  | Lookup      | N:1 to qdb_info_card_screen (required, cascade delete)        |
  | qdb_display_order        | Integer     | Ascending sort order within the screen (required)             |
  | qdb_section_title        | String(100) | Section header shown above items (optional)                   |
  | qdb_section_type         | Picklist    | numbered-steps (1) / icon-list (2) / download-list (3)        |
  | qdb_note_text            | String(500) | Callout/note shown at the bottom of the section (optional)    |
  | statecode                | Picklist    | Active / Inactive                                             |
  | createdon / createdby    | System      | Audit columns                                                 |
  | modifiedon / modifiedby  | System      | Audit columns                                                 |

A8.3 New Entity: qdb_info_card_item

  Purpose: Stores a single line item within an Info-Card Section.

  | Attribute                | Type         | Description                                                  |
  |--------------------------|--------------|--------------------------------------------------------------|
  | qdb_info_card_itemid     | GUID (PK)    | Unique identifier                                            |
  | qdb_name                 | String(200)  | Internal admin label                                         |
  | qdb_info_card_section_id | Lookup       | N:1 to qdb_info_card_section (required, cascade delete)      |
  | qdb_display_order        | Integer      | Ascending sort order within the section (required)           |
  | qdb_item_title           | String(120)  | Item heading shown to the user (required)                    |
  | qdb_item_description     | String(500)  | Supporting description below the title (optional)            |
  | qdb_icon_reference       | String(200)  | Named icon key or image URL (optional)                       |
  | qdb_download_url         | String(1000) | External URL (SharePoint/other) opened on download action    |
  | statecode                | Picklist     | Active / Inactive                                            |
  | createdon / createdby    | System       | Audit columns                                                |
  | modifiedon / modifiedby  | System       | Audit columns                                                |

A8.4 Changes to qdb_form_definition (Existing Entity)

  | Attribute                       | Type    | Default | Description                                              |
  |---------------------------------|---------|---------|----------------------------------------------------------|
  | qdb_allow_infocard_skip         | Boolean | false   | Whether the Skip control is shown on Info-Card Screens   |
  | qdb_infocard_counts_in_progress | Boolean | false   | Whether Info-Card Screens count in the progress bar      |

A8.5 Entity Relationships Summary

  qdb_form_definition   1--N  qdb_info_card_screen    (cascade delete)
  qdb_info_card_screen  1--N  qdb_info_card_section   (cascade delete)
  qdb_info_card_section 1--N  qdb_info_card_item      (cascade delete)

A8.6 Data Volume and Sensitivity

  | Entity                    | Est. Volume (Year 1) | Retention  | Sensitivity |
  |---------------------------|----------------------|------------|-------------|
  | qdb_info_card_screen      | 60 records           | Indefinite | Internal    |
  | qdb_info_card_section     | 240 records          | Indefinite | Internal    |
  | qdb_info_card_item        | 900 records          | Indefinite | Internal    |

  No PII stored. All content is static configuration data.


A9. INTEGRATION DEPENDENCIES
─────────────────────────────────────────────────────────────────────
This feature introduces no new external system integrations.
All data is stored in and read from the existing Dataverse environment
via the existing backend API. The metadata API (FR-005) must be
extended to include Info-Card Screen records in the form definition
JSON payload. No new API endpoints, queues, or third-party services
are required.

| System              | Integration Type      | Data Exchanged                              | Direction       |
|---------------------|-----------------------|---------------------------------------------|-----------------|
| Microsoft Dataverse | REST (OData Web API)  | Info-Card Screen records, form def flags    | Read (inbound)  |



A10. OPEN QUESTIONS — ALL RESOLVED
─────────────────────────────────────────────────────────────────────
All questions resolved 2026-06-05. No blockers remain for DFE-ADD-001.

| # | Question | Resolution | Date |
|---|---|---|---|
| Q-001 | Skip control: per-form or per-screen? | RESOLVED — Per-form toggle on qdb_form_definition. Data model unchanged. | 2026-06-05 |
| Q-002 | Icon set for screens? | RESOLVED — Screen icons are absolute image URLs. Item icons are named Fluent UI keys. | 2026-06-04 |
| Q-003 | Resume after draft save — show info screens or go straight to form? | RESOLVED — Skip info screens on resume; go straight to last-saved tab. | 2026-06-05 |
| Q-004 | Maximum info screens per form? | RESOLVED — NFR-018 default of 20 accepted. | 2026-06-04 |
| Q-005 | Rich text or plain text for body content? | RESOLVED — Plain text. Structure provided by sections and items. | 2026-06-04 |
| Q-006 | Audit log: every view or first-view-only? | RESOLVED — First-view-only per user per form. | 2026-06-05 |
| Q-007 | Configurable CTA label on final screen? | RESOLVED — Fixed labels: Continue (intermediate), Start (final). | 2026-06-04 |


A11. ASSUMPTIONS FOR THIS ADDENDUM
─────────────────────────────────────────────────────────────────────
AA-001: Info-Card Screens are purely read-only. No form state is
        initialised, no draft is created, and no validation engine
        is invoked while the user is on Info-Card Screens.

AA-002: The metadata API response for a form definition will be
        extended to include the Info-Card Screen array. No new API
        endpoint is required; only the response schema changes.

AA-003: The icon reference in the first release will be a string
        key from the Fluent UI icon library. An image URL option
        will be supported as a fallback, pending resolution of Q-002.

AA-004: The "Get Started" label on the last screen's CTA button is
        a fixed string in this release, pending stakeholder
        confirmation of Q-007.

AA-005: The existing WCAG 2.1 Level AA commitment (NFR-013) extends
        to Info-Card Screens without renegotiation.

AA-006: Info-Card Screens will be included in the existing form
        preview mode with no separate preview mechanism needed.


A12. REQUIREMENTS TRACEABILITY — ADDENDUM
─────────────────────────────────────────────────────────────────────
| User Story | Functional Requirements                                    | Business Objective | Test Cases          | Status |
|------------|------------------------------------------------------------|--------------------|---------------------|--------|
| US-13      | FR-048, FR-049, FR-050, FR-051, FR-052, FR-053             | BO-001, BO-007     | TC-076 (pending)    | Draft  |
| US-14      | FR-053, FR-054, FR-055, FR-056, FR-057, FR-059, FR-061     | BO-002, BO-008     | TC-077 (pending)    | Draft  |
| US-15      | FR-059, FR-060, FR-062                                     | BO-002             | TC-078 (pending)    | Draft  |
| US-16      | FR-063, FR-064, FR-065                                     | BO-002             | TC-079 (pending)    | Draft  |
| US-17      | FR-074, FR-075                                             | BO-001, BO-006     | TC-080 (pending)    | Draft  |
| US-13–17   | FR-058, FR-066, FR-067, FR-068, FR-069, FR-070             | BO-002, BO-007     | TC-081 (pending)    | Draft  |
| US-13–17   | FR-071, FR-072, FR-073, FR-076                             | BO-004, BO-008     | TC-082 (pending)    | Draft  |


A13. ADDENDUM APPROVAL
─────────────────────────────────────────────────────────────────────
| Role              | Name              | Decision  | Date |
|-------------------|-------------------|-----------|------|
| CEO               | Maqsad AI — CEO   | PENDING   |      |
| Requestor (QDB)   | Pending           | PENDING   |      |
| BA                | Maqsad AI — BA    | SUBMITTED | 2026-06-04 |

═══════════════════════════════════════════════════
END OF ADDENDUM — DFE-ADD-001
═══════════════════════════════════════════════════


═══════════════════════════════════════════════════
BRD ADDENDUM — FEATURE MODULE: BOOLEAN FIELD TYPE,
INTERACTIVE GRID FIELD TYPE, TAB-AWARE SAVE & SUBMIT
═══════════════════════════════════════════════════
Addendum Reference: DFE-ADD-002
Parent BRD:         Dynamic Form Engine Portal — QDB (v1.0)
Prepared by:        Maqsad AI — Business Analyst
Date:               2026-06-05
Version:            1.0
Status:             READY FOR CEO REVIEW — All open questions resolved 2026-06-05
Numbering:          FRs continue from FR-088. NFRs from NFR-019.
                    BRs from BR-018. USs from US-18.
═══════════════════════════════════════════════════


B1. FEATURE OVERVIEW
─────────────────────────────────────────────────────────────────────
This addendum introduces three independently deliverable enhancements
to the Dynamic Form Engine Portal. Each enhancement extends the
existing metadata-driven architecture without altering any previously
approved requirements.

Enhancement 1 — Boolean Field Type
The form engine currently supports a checkbox field type that yields a
checked/unchecked binary value with no configurable labels. Stakeholders
require a richer binary-choice field — the Boolean field type — that
renders as a toggle switch or a labeled radio pair and exposes fully
configurable true-value and false-value labels (for example "Yes / No",
"Active / Inactive", "Agree / Disagree"). The submitted value is always
a strict boolean (true or false). Label text is stored as metadata in
Dataverse on the field record, so no code change is required when a
form author wants different label text on a different form.

Enhancement 2 — Interactive Grid Field Type
The form engine currently supports a Repeating Grid field type (FR-012)
where users manually add rows with child-field inputs. Stakeholders
require a more powerful Interactive Grid that operates in one of two
distinct modes, both configurable per field instance.

Mode A (Selection Grid) loads and displays existing Dataverse records
in a read-only table so users can select one or more rows. The form
author configures which entity to load, which attributes to show as
columns, a filter expression to restrict visible records, and whether
selection is single or multi. The ID(s) of selected records are
captured in the submission payload and submitted as relationship
references.

Mode B (Entry Grid) renders a blank editable table where users add new
rows inline before submission. Each row represents a new child record
to be created in a configured Dataverse entity, linked to the parent
submission record. The form author configures the target entity, the
editable columns, and the relationship attribute that links child rows
to the parent submission.

Enhancement 3 — Tab-Aware Save & Draft + Submit Buttons (System-Managed)
The existing button design is stored per-form in the qdb_button_design
table (label, style). Currently the portal places buttons without formal
rules about which button appears on which tab. Stakeholders require that:
(a) when a form definition permits saving drafts, a "Save & Draft" button
appears automatically on every tab; and (b) a "Submit" button appears
automatically on the final tab only (determined by highest display order).
No per-tab button configuration is required. Placement is system-managed
based on two new boolean flags on the form definition record. Button
label and style continue to be sourced from the existing qdb_button_design
table. No new Dataverse tables are introduced by this enhancement, though
two new picklist values for qdb_button_type may be required if not already
present.

All three enhancements support Business Objectives BO-001 and BO-002.
Enhancement 2 additionally supports BO-003 (structured CRM records for
Relationship Managers).


B2. ADDITIONAL BUSINESS OBJECTIVES
─────────────────────────────────────────────────────────────────────
BO-009: Enable the CRM Configuration Team to define binary-choice
        fields with custom true/false labels so that forms can
        present contextually appropriate binary choices (Agree /
        Disagree, Active / Inactive) without frontend code changes.

BO-010: Enable the CRM Configuration Team to embed read-only record
        selection grids inside forms so that portal users can select
        existing CRM entities (branches, products, service tiers)
        as part of a form submission without leaving the portal.

BO-011: Enable the CRM Configuration Team to embed inline data-entry
        grids inside forms so that portal users can submit multiple
        related records (beneficiaries, co-applicants, assets) within
        a single form flow, reducing multi-step processes to a single
        submission.

BO-012: Enable the portal to enforce consistent Save & Draft and Submit
        button placement rules automatically so that form authors do
        not need to manually configure per-tab button behaviour, and
        portal users experience a predictable, consistent submission
        flow across all forms.


B3. SCOPE
─────────────────────────────────────────────────────────────────────

B3.1 In Scope
     - Boolean field type: new field type value added to the field
       type picklist on qdb_form_field.
     - Two new attributes on qdb_form_field: qdb_true_label and
       qdb_false_label, used exclusively by the boolean field type.
     - Portal rendering of the boolean field as a toggle switch or
       labeled radio pair, configurable by the form author via a
       render style attribute.
     - Boolean field default value support (true or false, configured
       in metadata).
     - Boolean field participation in the conditional rule engine and
       validation engine on equal terms with all existing field types.
     - Interactive Grid field type: new field type value added to the
       field type picklist on qdb_form_field.
     - New Dataverse entity qdb_grid_column_config to store per-column
       definitions for grid fields.
     - New attributes on qdb_form_field for grid configuration: mode
       (selection / entry), target entity logical name, filter
       expression, selection mode (single / multi), and relationship
       attribute.
     - Selection Grid (Mode A): OData-driven record loading, configurable
       column display, single-select and multi-select, selected record
       ID(s) captured in submission payload.
     - Entry Grid (Mode B): inline row addition, editing, and deletion
       before submission; child record creation on final submission
       linked to parent submission record.
     - Support for both modes on the same form (on different tabs or
       different sections).
     - Grid field participation in the save-as-draft flow: row state
       persisted to the draft record.
     - Grid field participation in validation: minimum rows required,
       maximum rows allowed, configurable per field.
     - Tab-aware Save & Draft and Submit button placement: two new
       boolean attributes on qdb_form_definition (qdb_allow_save_draft
       already exists per FR-023; confirmation of its presence or
       addition of qdb_show_submit_on_final_tab_only as a new
       attribute).
     - System-managed rendering of "Save & Draft" on every tab when
       qdb_allow_save_draft is true.
     - System-managed rendering of "Submit" on the final tab only,
       determined by highest qdb_display_order among active tab
       records.
     - Existing qdb_button_design table used as-is for label and style;
       no new table created.
     - New picklist values on qdb_button_type: save_draft and submit,
       if not already present.
     - WCAG 2.1 Level AA compliance for all new field types and button
       behaviours.
     - Mobile-responsive rendering of boolean, grid, and button
       controls.
     - Admin screen support for configuring boolean field labels,
       grid column definitions, and the tab-aware button flags.

B3.2 Out of Scope
     - The existing checkbox field type is not modified or replaced
       by the boolean field type; both coexist in the system.
     - Tri-state or nullable boolean (null / true / false) is not
       supported in this release; the boolean field always has a
       definitive true or false state after interaction.
     - Grid column types beyond those supported by the existing field
       type set are not added in this release.
     - Grid column-level validation beyond the existing validation rule
       types (FR-019) is not in scope.
     - Server-side filtering of Selection Grid records beyond a single
       OData filter expression is not in scope; complex multi-filter
       builders are out of scope.
     - Inline editing of existing (pre-loaded) records in Selection
       Grid (Mode A); selection only, no editing of loaded records.
     - Pagination or virtual scrolling for large Selection Grid result
       sets beyond a configurable maximum row count is out of scope
       in this release.
     - Drag-and-drop row reordering in Entry Grid (Mode B).
     - Import from CSV or Excel into Entry Grid rows.
     - Per-tab button configuration (manual override of system-managed
       placement) is out of scope for this addendum; if per-tab
       customisation is required, a further addendum must be raised.
     - A "Save & Continue" button that saves draft and navigates to
       the next tab in a single action is out of scope for this
       addendum.
     - Email or SMS notification triggered by the Save & Draft action
       is out of scope (Power Automate handles downstream notifications
       independently).


B4. FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────

B4.1 Boolean Field Type — Metadata

FR-088: The system shall support a new field type value of "boolean"
        in the field type picklist on the qdb_form_field entity,
        distinct from the existing "checkbox" type.

FR-089: The system shall allow each qdb_form_field record of type
        "boolean" to store a qdb_true_label attribute (string,
        maximum 60 characters, required for boolean type) representing
        the display label for the true value.

FR-090: The system shall allow each qdb_form_field record of type
        "boolean" to store a qdb_false_label attribute (string,
        maximum 60 characters, required for boolean type) representing
        the display label for the false value.

FR-091: The system shall allow each qdb_form_field record of type
        "boolean" to store a qdb_bool_render_style attribute (picklist:
        toggle / radio-pair) that controls how the field is rendered
        in the portal. The default render style when the attribute is
        absent shall be toggle.

FR-092: The system shall allow each qdb_form_field record of type
        "boolean" to store a qdb_default_value attribute interpreted
        as a boolean (true / false). When set, the field shall be
        pre-populated with the configured default on initial form load.
        When absent, no value is pre-selected on load.

B4.2 Boolean Field Type — Rendering

FR-093: When qdb_bool_render_style is "toggle", the system shall
        render the boolean field as a toggle switch control with the
        qdb_false_label displayed to the left (or above on mobile)
        and the qdb_true_label displayed to the right (or below on
        mobile) of the switch element.

FR-094: When qdb_bool_render_style is "radio-pair", the system shall
        render the boolean field as a pair of radio buttons within a
        radio group, with qdb_true_label as the label for the first
        option and qdb_false_label as the label for the second option.

FR-095: The system shall submit the boolean field value as a strict
        boolean (true or false) in the form submission payload. The
        string representations of the labels shall not be submitted;
        only the boolean primitive value shall be mapped to Dataverse.

FR-096: The system shall treat a boolean field that has never been
        interacted with and has no configured default value as having
        no submitted value. If the field has a required validation rule,
        the system shall surface a validation error on submission
        attempt when no value has been selected, using the configured
        validation error message.

FR-097: The system shall render the boolean field's qdb_field_label
        as a visible label element associated with the toggle or radio
        group control via the appropriate HTML labelling relationship,
        so that the field label is accessible to screen readers.

FR-098: When a boolean field is set to read-only by a conditional rule
        (FR-014), the system shall render the toggle or radio pair in
        a disabled state that visually communicates non-interactivity
        and prevents user interaction, while still displaying the
        current value.

B4.3 Boolean Field Type — Rule Engine and Validation Participation

FR-099: The system shall support boolean field values as trigger
        conditions in the conditional rule engine (FR-015), evaluating
        "field equals true", "field equals false", "field is empty",
        and "field is not empty" conditions for boolean field types.

FR-100: The system shall support the "set field value" rule action
        (FR-014) on boolean fields, accepting true or false as the
        configured value to set.

FR-101: The system shall support the "required" validation rule type
        (FR-019) on boolean fields. A boolean field marked as required
        is invalid if it has no selected value (neither true nor false
        has been explicitly chosen and no default is configured).

B4.4 Boolean Field Type — Draft Persistence

FR-102: The system shall persist the current boolean field value
        (true, false, or null/unset) to the draft record when the
        user saves a draft (FR-023). On draft resume (FR-024), the
        field shall be restored to its persisted state exactly.

B4.5 Interactive Grid Field Type — Metadata

FR-103: The system shall support a new field type value of
        "interactive-grid" in the field type picklist on the
        qdb_form_field entity.

FR-104: Each qdb_form_field record of type "interactive-grid" shall
        store a qdb_grid_mode attribute (picklist: selection / entry,
        required) indicating which of the two grid operating modes
        the field uses.

FR-105: Each qdb_form_field record of type "interactive-grid" shall
        store a qdb_grid_target_entity attribute (string, maximum 100
        characters, required) containing the Dataverse logical name of
        the target entity from which records are loaded (Mode A) or
        into which new records are created (Mode B).

FR-106: Each qdb_form_field record of type "interactive-grid" in Mode A
        (selection) shall store a qdb_grid_filter_expression attribute
        (string, maximum 2,000 characters, optional) containing a
        valid OData filter expression to restrict which records are
        returned from the target entity query.

FR-107: Each qdb_form_field record of type "interactive-grid" in Mode A
        (selection) shall store a qdb_grid_selection_mode attribute
        (picklist: single / multi, required for Mode A) indicating
        whether the user may select one row or multiple rows.

FR-108: Each qdb_form_field record of type "interactive-grid" in Mode B
        (entry) shall store a qdb_grid_relationship_attribute attribute
        (string, maximum 100 characters, required for Mode B) containing
        the Dataverse lookup attribute name on the child entity that
        references the parent submission record.

FR-109: The system shall store per-column definitions for each
        interactive grid field in a dedicated Dataverse entity
        qdb_grid_column_config. Each column record shall reference its
        parent qdb_form_field record via a lookup.

FR-110: Each qdb_grid_column_config record shall store: a display order
        integer, a column header label (string, maximum 100 characters,
        required), a target attribute logical name (string, maximum 100
        characters, required), a column width hint (integer, pixels or
        percentage, optional), and an is_editable boolean flag (required
        for Mode B; ignored for Mode A).

B4.6 Interactive Grid Field Type — Selection Grid Rendering (Mode A)

FR-111: When the form is loaded, the system shall query the Dataverse
        target entity for the interactive-grid field using the
        configured OData filter expression (if present) and return
        records via the backend API. The query shall return only active
        records and only the attributes listed in the associated
        qdb_grid_column_config records.

FR-112: The system shall render the loaded records as a table with one
        column per qdb_grid_column_config record, in ascending display
        order, and one row per returned Dataverse record.

FR-113: The system shall enforce a maximum of 200 rows displayed in a
        Selection Grid. If the query returns more than 200 records, the
        system shall display the first 200 records and show a visible
        informational notice to the user that results have been
        truncated, and that a more specific filter should be configured.
        The 200-row limit is configurable per field via a
        qdb_grid_max_rows attribute on qdb_form_field (integer, default
        200, maximum 500).

FR-114: When qdb_grid_selection_mode is "single", the system shall
        render a radio button in the leftmost column of each row. The
        user may select exactly one row. Selecting a new row shall
        deselect any previously selected row.

FR-115: When qdb_grid_selection_mode is "multi", the system shall
        render a checkbox in the leftmost column of each row, and a
        "select all" checkbox in the column header. The user may
        select any number of rows, including zero.

FR-116: The system shall capture the Dataverse record ID (GUID) of
        each selected row and include the selected ID(s) in the form
        submission payload, mapped to the Dataverse attribute specified
        in the field's submission mapping configuration.

FR-117: For single-select grids, the submission payload value shall be
        a single GUID string. For multi-select grids, the submission
        payload value shall be an array of GUID strings.

FR-118: The system shall display the Selection Grid in a loading state
        (spinner or skeleton rows) while the OData query is in flight,
        and shall display a user-friendly error message if the query
        fails, with a retry action available.

FR-119: The system shall re-execute the OData query for a Selection
        Grid field when the field's configured filter expression
        contains a reference to another form field's value (denoted by
        a field reference token in the filter expression, syntax to be
        confirmed in the architecture phase) and that referenced field's
        value changes. The grid shall refresh its displayed records
        accordingly, and any previously selected rows shall be cleared.

B4.7 Interactive Grid Field Type — Entry Grid Rendering (Mode B)

FR-120: The system shall render an Entry Grid field as an empty table
        with column headers defined by the associated
        qdb_grid_column_config records (is_editable = true columns)
        and an "Add Row" action control below the table.

FR-121: When the user activates "Add Row", the system shall append a
        new editable row to the bottom of the Entry Grid table. Each
        cell in the new row shall render an appropriate input control
        based on the data type of the target attribute (text input,
        number input, date picker, dropdown — using the same field type
        mapping as the main form field types).

FR-122: The system shall allow the user to edit any cell in any row
        that has been added in the current session before submission.

FR-123: The system shall allow the user to delete any row that has been
        added in the current session before submission. A delete action
        control shall be rendered at the end of each row. Deleting a
        row shall remove it from the grid immediately with no
        confirmation prompt.

FR-124: The system shall enforce the minimum rows required constraint
        on Entry Grid fields. The minimum is configured via a
        qdb_grid_min_rows attribute on qdb_form_field (integer, default
        0). If the number of rows at submission time is less than
        qdb_grid_min_rows, submission shall be blocked and a validation
        error displayed using the configured message.

FR-125: The system shall enforce the maximum rows allowed constraint
        on Entry Grid fields. The maximum is configured via a
        qdb_grid_max_rows attribute on qdb_form_field (integer, default
        unlimited). When the row count reaches qdb_grid_max_rows, the
        "Add Row" control shall be disabled and a visible message shall
        inform the user that the maximum number of rows has been reached.

FR-126: On final form submission, the system shall create one new
        Dataverse record per row in each Entry Grid field, in the
        configured qdb_grid_target_entity, populating each attribute
        from the corresponding grid cell value. Each created child
        record shall have its qdb_grid_relationship_attribute populated
        with the GUID of the parent submission record.

FR-127: Child record creation for Entry Grid rows shall be treated as
        part of the atomic submission transaction defined in BR-006. If
        any child row record creation fails, all parent and child
        records created in the submission shall be rolled back.

B4.8 Interactive Grid Field Type — Draft Persistence

FR-128: The system shall persist the state of all interactive grid
        fields (selected row IDs for Mode A; all entered row data for
        Mode B) to the draft record when the user saves a draft.

FR-129: On draft resume, the system shall restore the interactive grid
        fields to their persisted state. For Mode A, previously selected
        rows shall be re-selected if those records still exist and are
        still returned by the OData query. For Mode B, all previously
        entered rows shall be restored with their exact cell values.

FR-130: For Mode A draft resume, if a previously selected record is
        no longer returned by the OData query (because it was deleted
        or no longer meets the filter), the system shall silently
        deselect that record and display an informational notice to the
        user that one or more previously selected records are no longer
        available.

B4.9 Interactive Grid Field Type — Validation and Rule Engine

FR-131: The system shall support the interactive grid field as a
        participant in the conditional rule engine for show/hide actions
        at the field level (FR-014), so that a grid can be shown or
        hidden based on the value of another field.

FR-132: The system shall support a "field is not empty" trigger
        condition (FR-015) on interactive grid fields, evaluating to
        true when at least one row is present (Mode B) or at least one
        row is selected (Mode A).

FR-133: The system shall validate each cell value in an Entry Grid row
        against the validation rules associated with that column's
        qdb_grid_column_config record. Cell-level validation errors
        shall be displayed inline within the relevant cell.

B4.10 Interactive Grid Field Type — Mobile Responsiveness

FR-134: On viewports below 768 px width, the system shall render
        interactive grid tables in a horizontally scrollable container
        so that column data is not truncated on small screens. A visual
        scroll indicator shall inform users that the table extends
        beyond the visible area.

FR-135: The "Add Row" action control and row-level delete control shall
        have a minimum touch target size of 44 x 44 CSS pixels on
        mobile viewports, in compliance with WCAG 2.1 SC 2.5.5.

B4.11 Interactive Grid Field Type — Admin Configuration

FR-136: The system shall allow CRM Configuration Team members to
        create, read, update, and delete qdb_grid_column_config records
        from within the existing admin configuration screens (extending
        FR-040), with the same access control (FR-042). Column records
        shall be editable in a sub-grid view within the parent field's
        admin record.

FR-137: The admin configuration screen shall enforce that an
        interactive-grid field has at least one associated
        qdb_grid_column_config record before activation, and shall
        display a blocking validation error if a grid field is activated
        with no column records defined.

FR-138: The admin configuration screen shall enforce that a
        qdb_grid_mode of "selection" requires qdb_grid_selection_mode
        to be set, and that a qdb_grid_mode of "entry" requires
        qdb_grid_relationship_attribute to be set. A blocking validation
        error shall be displayed if either required attribute is absent.

B4.12 Tab-Aware Save & Draft Button — Rendering

FR-139: The system shall read the qdb_allow_save_draft boolean
        attribute from the form definition record. When this attribute
        is true, the system shall render a "Save & Draft" button on
        every tab of the form, using the button label and style
        configured in the qdb_button_design record for button_type
        = save_draft.

FR-140: When qdb_allow_save_draft is false or absent on the form
        definition record, no "Save & Draft" button shall be rendered
        on any tab. This is consistent with the existing save-as-draft
        behaviour described in FR-023.

FR-141: The system shall determine the final tab of a form as the
        active qdb_tab record with the highest qdb_display_order value
        among all active tabs associated with the form definition.

FR-142: The system shall render a "Submit" button exclusively on the
        final tab as determined by FR-141. The button label and style
        shall be sourced from the qdb_button_design record for
        button_type = submit.

FR-143: The "Submit" button shall not be rendered on any non-final tab.
        If the form has only one tab, that tab is both the first and
        final tab, and the Submit button shall be rendered on it.

FR-144: The system shall re-evaluate which tab is the final tab each
        time the form metadata is loaded. If a form author reorders
        tabs by changing display order values, the Submit button shall
        automatically migrate to the new final tab on the next portal
        load without any further configuration.

B4.13 Tab-Aware Save & Draft Button — Behaviour

FR-145: When the user activates the "Save & Draft" button on any tab,
        the system shall execute the save-as-draft flow defined in
        FR-023 without navigating away from the current tab. A success
        confirmation message shall be displayed inline on the current
        tab.

FR-146: The "Save & Draft" button shall be available and operable at
        any point in the form flow, regardless of whether the current
        tab's fields are valid. Draft saving does not require tab-level
        validation to pass.

FR-147: When the user activates the "Submit" button on the final tab,
        the system shall execute the full validation pass defined in
        FR-026 across all tabs and sections before proceeding with
        submission. If any validation failure is found, the button
        shall not proceed with submission and the existing validation
        failure behaviour (FR-021) shall apply.

FR-148: The "Submit" button shall be rendered in a visually distinct
        primary style as configured in qdb_button_design to distinguish
        it from the "Save & Draft" button, which shall use a secondary
        or outlined style.

B4.14 Tab-Aware Save & Draft Button — qdb_button_design Picklist

FR-149: The system shall ensure that the qdb_button_type picklist on
        the qdb_button_design entity contains at minimum the values
        "save_draft" and "submit". If these values are not present in
        the existing picklist, they shall be added as new picklist
        values as part of this enhancement's Dataverse solution
        deployment.

FR-150: If no qdb_button_design record exists for button_type
        "save_draft" on a given form definition when qdb_allow_save_draft
        is true, the system shall fall back to a default label of
        "Save & Draft" and a default secondary button style. No error
        shall be thrown; the fallback ensures the button always
        renders when the flag is enabled.

FR-151: If no qdb_button_design record exists for button_type
        "submit" on a given form definition, the system shall fall
        back to a default label of "Submit" and a default primary
        button style. No error shall be thrown.

B4.15 Audit Logging — New Events

FR-152: The system shall write an audit log entry of event type
        "grid_selection_changed" to the Audit Log table each time a
        portal user changes the selection state of a Selection Grid
        (Mode A) field, recording the form definition ID, field ID,
        number of selected records, and timestamp (UTC). This event
        shall be written only on final selection (not on every
        intermediate click in a multi-select grid).

FR-153: The system shall write an audit log entry of event type
        "grid_row_added" and "grid_row_deleted" to the Audit Log
        table for each row addition and deletion event in an Entry
        Grid (Mode B) field, recording the form definition ID, field
        ID, row index, and timestamp (UTC).


B5. NON-FUNCTIONAL REQUIREMENTS
─────────────────────────────────────────────────────────────────────
NFR-019: Performance — A Selection Grid (Mode A) OData query for up
         to 200 records shall complete and render within 1,500 ms at
         the 95th percentile under 100 concurrent users. This is
         measured from the time the user navigates to the tab
         containing the Selection Grid to the time the table is fully
         rendered and interactive.

NFR-020: Performance — Adding a new row to an Entry Grid (Mode B)
         shall be a purely client-side operation and shall complete
         within 100 ms of the user activating the "Add Row" control,
         with no server round-trip required.

NFR-021: Scalability — The qdb_grid_column_config entity shall support
         a minimum of 20 column records per grid field and a minimum
         of 5,000 total column records across all grid fields without
         degradation of metadata API response time beyond the NFR-001
         threshold.

NFR-022: Scalability — An Entry Grid field shall support a minimum of
         50 rows per field instance in a single form session without
         client-side performance degradation (frame rate below 30 fps
         or input latency above 100 ms).

NFR-023: Security — The OData filter expression stored in
         qdb_grid_filter_expression shall be treated as a trusted
         configuration value authored by the CRM Configuration Team
         and shall not be modifiable by portal users. The backend API
         shall apply the filter expression exactly as stored; portal
         users shall have no mechanism to override or bypass it.

NFR-024: Accessibility — The Selection Grid and Entry Grid tables
         shall be implemented as semantic HTML table elements with
         appropriate ARIA roles (grid, row, gridcell, columnheader)
         so that screen reader users can navigate table contents and
         understand selection state. This extends the NFR-013
         WCAG 2.1 Level AA commitment to grid controls.

NFR-025: Availability — The Save & Draft button behaviour is dependent
         on the same Dataverse API availability as the existing
         save-as-draft flow (FR-023). The tab-aware placement logic
         is purely client-side and has no additional infrastructure
         dependency.


B6. BUSINESS RULES
─────────────────────────────────────────────────────────────────────
BR-018: The boolean field type and the checkbox field type are distinct
        and independent. A boolean field stores a true/false primitive
        with configurable labels. A checkbox field stores a
        checked/unchecked state. Neither type may be substituted for
        the other in submission mapping or rule conditions without an
        explicit field type change in metadata.

BR-019: A boolean field of type "boolean" that has no qdb_true_label
        or qdb_false_label configured shall be treated as a
        misconfigured field. The portal shall not render it and shall
        log an error to the backend API error log. The admin screen
        shall enforce that both labels are present before the field
        record can be saved as Active.

BR-020: The submitted value of a boolean field shall always be the
        boolean primitive true or false. It shall never be submitted
        as the label string. Submission mapping must point to a
        Dataverse Two Options (boolean) attribute; pointing to a text
        attribute is a configuration error and shall cause submission
        to fail with a descriptive error message.

BR-021: An Interactive Grid field of mode "selection" shall never
        create or modify Dataverse records directly. It only reads
        records for display and captures selected IDs for submission
        mapping. All write operations are performed by the existing
        submission mapping logic (FR-027).

BR-022: An Interactive Grid field of mode "entry" shall only create
        new records on final submission. Rows entered in the grid
        before submission exist only in client-side state and draft
        persistence. No partial row creation shall occur on draft save.

BR-023: All child records created by Entry Grid (Mode B) row
        submission are governed by BR-006 (atomic submission
        transaction). If the parent record creation fails, no child
        records are created. If any child record creation fails after
        the parent record has been created, all records (parent and
        children) are rolled back.

BR-024: A Selection Grid (Mode A) that has qdb_grid_selection_mode =
        "single" shall include at most one GUID in its submission
        payload at the point of final submission. If the in-memory
        state contains more than one selected ID at submission time
        (which should not occur through normal interaction but may
        arise from programmatic manipulation), only the most recently
        selected record ID shall be submitted and the rest discarded.

BR-025: The final tab of a form (for the purpose of Submit button
        placement) is always determined by the highest
        qdb_display_order value among active (statecode = Active) tab
        records. Inactive tabs are excluded from this calculation.
        If all tabs are inactive, no Submit button is rendered and
        the portal displays a configuration error to the form author
        in preview mode.

BR-026: The "Save & Draft" button shall not perform tab-level
        validation before saving. It shall persist all currently
        entered values regardless of validation state. This rule
        exists to allow users to save incomplete work without being
        blocked by required-field errors.

BR-027: The "Submit" button shall only appear on the final tab as
        defined by BR-025. No configuration change, conditional rule,
        or rule engine action shall move the Submit button to a
        non-final tab. This rule is enforced in the rendering layer,
        not in metadata.


B7. USER STORIES
─────────────────────────────────────────────────────────────────────

US-18
  As a CRM Configuration Team member, I want to define a boolean
  field with custom true and false labels so that portal users see
  contextually appropriate choices ("Agree / Disagree") rather than
  a generic checkbox.
  Priority: Must Have
  Acceptance Criteria:
    Given a qdb_form_field record of type "boolean" with
      qdb_true_label = "Agree" and qdb_false_label = "Disagree"
    When a portal user views the form
    Then the field is rendered with the labels "Agree" and "Disagree"
      and the submitted value is the boolean true or false, not the
      label string.

US-19
  As a Portal User (bank customer), I want to toggle a boolean field
  using a clearly labeled switch or radio pair so that I understand
  exactly what I am selecting and can change my choice before
  submitting.
  Priority: Must Have
  Acceptance Criteria:
    Given a boolean field rendered as a toggle with labels
      "Yes" (true) and "No" (false)
    When the portal user activates the toggle
    Then the toggle state changes from false to true (or true to
      false), the label highlights the active state, and the
      submitted value reflects the current toggle state at submission.

US-20
  As a CRM Configuration Team member, I want to embed a Selection
  Grid in a form tab so that portal users can choose an existing CRM
  record (such as a product or branch) as part of their submission
  without the form author needing to write custom frontend code.
  Priority: Must Have
  Acceptance Criteria:
    Given an interactive-grid field of mode "selection" targeting the
      qdb_product entity with two column configs (Product Name,
      Product Code) and qdb_grid_selection_mode = "single"
    When a portal user navigates to the tab containing the grid
    Then the grid loads and displays active qdb_product records
      with the two configured columns, and the user can select
      exactly one row; the selected product GUID is included in
      the submission payload.

US-21
  As a Portal User (bank customer), I want to add multiple
  beneficiary rows in an Entry Grid so that I can declare all
  beneficiaries in a single form submission without submitting
  the form multiple times.
  Priority: Must Have
  Acceptance Criteria:
    Given an interactive-grid field of mode "entry" targeting the
      qdb_beneficiary entity with columns Name and Relationship
    When the portal user adds two rows with valid data and submits
      the form
    Then two new qdb_beneficiary records are created in Dataverse,
      each linked to the parent submission record via the configured
      relationship attribute.

US-22
  As a Portal User (bank customer), I want to save a draft of a
  form that contains grid fields so that my grid data (selections
  and entered rows) is preserved when I return to complete the form.
  Priority: Must Have
  Acceptance Criteria:
    Given a form with both a Selection Grid (one row selected) and
      an Entry Grid (two rows entered)
    When the portal user saves a draft and later resumes it
    Then the Selection Grid shows the previously selected row
      highlighted, and the Entry Grid shows the two previously
      entered rows with their exact cell values restored.

US-23
  As a Portal User (bank customer), I want a "Save & Draft" button
  available on every tab so that I can save my progress at any
  point in the form without having to navigate to a specific tab.
  Priority: Must Have
  Acceptance Criteria:
    Given a form definition with qdb_allow_save_draft = true and
      four active tabs
    When the portal user is on any of the four tabs
    Then a "Save & Draft" button is visible and operable on that
      tab, saving the current form state to Dataverse when activated.

US-24
  As a Portal User (bank customer), I want the Submit button to
  appear only on the final tab so that I do not accidentally submit
  an incomplete form while still filling in earlier tabs.
  Priority: Must Have
  Acceptance Criteria:
    Given a form with four active tabs where the final tab has the
      highest display order value
    When the portal user is on tabs 1, 2, or 3
    Then no Submit button is visible on those tabs.
    When the portal user navigates to tab 4 (the final tab)
    Then the Submit button is visible and operable.

US-25
  As a CRM Configuration Team member, I want the Submit button
  to automatically migrate to the new final tab when I reorder
  tabs by changing display order values, so that I do not need
  to reconfigure button placement after a form restructure.
  Priority: Must Have
  Acceptance Criteria:
    Given a form with tabs at display orders 10, 20, 30, 40 where
      Submit is on display order 40
    When the form author changes the display order of the current
      last tab from 40 to 15 (making display order 30 the new final)
    Then on the next portal load the Submit button appears on the
      tab with display order 30 and is absent from the tab now
      at display order 15.


B8. DATA MODEL CHANGES
─────────────────────────────────────────────────────────────────────

B8.1 Changes to qdb_form_field (Existing Entity)

  The following new attributes are added to the existing
  qdb_form_field entity to support all three enhancements.

  Boolean field type attributes:

  | Attribute               | Type         | Default  | Description                                                      |
  |-------------------------|--------------|----------|------------------------------------------------------------------|
  | qdb_true_label          | String(60)   | null     | Display label for the true value (required for boolean type)     |
  | qdb_false_label         | String(60)   | null     | Display label for the false value (required for boolean type)    |
  | qdb_bool_render_style   | Picklist     | toggle   | Render style: toggle (1) / radio-pair (2) — boolean type only    |

  Interactive Grid field type attributes:

  | Attribute                       | Type         | Default   | Description                                                               |
  |---------------------------------|--------------|-----------|---------------------------------------------------------------------------|
  | qdb_grid_mode                   | Picklist     | null      | Grid mode: selection (1) / entry (2) — grid type only                     |
  | qdb_grid_target_entity          | String(100)  | null      | Dataverse logical name of the target entity                               |
  | qdb_grid_filter_expression      | String(2000) | null      | OData filter expression (Mode A only, optional)                           |
  | qdb_grid_selection_mode         | Picklist     | null      | Selection mode: single (1) / multi (2) — Mode A only                      |
  | qdb_grid_relationship_attribute | String(100)  | null      | Lookup attribute on child entity linking to parent submission (Mode B)    |
  | qdb_grid_min_rows               | Integer      | 0         | Minimum rows required before submission (Mode B only)                     |
  | qdb_grid_max_rows               | Integer      | null      | Maximum rows allowed; also caps Selection Grid display (default 200 for A)|

B8.2 New Entity: qdb_grid_column_config

  Purpose: Stores the definition of a single column within an
           interactive grid field. One record per column, multiple
           records per grid field instance.

  | Attribute                    | Type         | Description                                                                |
  |------------------------------|--------------|----------------------------------------------------------------------------|
  | qdb_grid_column_configid     | GUID (PK)    | Unique identifier                                                          |
  | qdb_name                     | String(200)  | Internal admin label                                                       |
  | qdb_form_field_id            | Lookup       | N:1 to qdb_form_field (required, cascade delete)                           |
  | qdb_display_order            | Integer      | Ascending sort order of the column left to right (required)                |
  | qdb_column_header            | String(100)  | Column header label shown in the table (required)                          |
  | qdb_target_attribute         | String(100)  | Dataverse attribute logical name this column reads from / writes to        |
  | qdb_column_width_hint        | Integer      | Suggested column width in pixels; null means auto-width (optional)         |
  | qdb_is_editable              | Boolean      | Whether the column is editable in Mode B rows (required, default false)    |
  | qdb_column_field_type        | Picklist     | Field type for cell input in Mode B (text, number, date, dropdown, etc.)   |
  | statecode                    | Picklist     | Active / Inactive — inactive columns excluded from grid rendering          |
  | createdon / createdby        | System       | Audit columns                                                              |
  | modifiedon / modifiedby      | System       | Audit columns                                                              |

  Entity Relationship:
    qdb_form_field  1--N  qdb_grid_column_config  (cascade delete)

B8.3 Changes to qdb_form_definition (Existing Entity)

  Note: qdb_allow_save_draft is expected to already exist on
  qdb_form_definition per the existing save-as-draft functionality
  (FR-023). If it does not exist as a named boolean attribute, it
  shall be added as part of this enhancement. No new flag is required
  for Submit button placement — the system derives final tab from
  the maximum display order of active tab records (BR-025).

  | Attribute             | Type    | Default | Description                                                          |
  |-----------------------|---------|---------|----------------------------------------------------------------------|
  | qdb_allow_save_draft  | Boolean | false   | Confirm or add: enables "Save & Draft" button on all tabs when true  |

B8.4 Changes to qdb_button_design (Existing Entity) — Picklist Only

  No structural changes to the qdb_button_design table schema.
  The following picklist values shall be confirmed or added to the
  qdb_button_type option set:

  | Value Label   | Value (integer) | Description                                                 |
  |---------------|-----------------|-------------------------------------------------------------|
  | save_draft    | (next available)| Identifies the button design record used for Save & Draft   |
  | submit        | (next available)| Identifies the button design record used for Submit         |

  If these values already exist in the picklist from prior
  configuration, no change is needed.

B8.5 Data Volume and Sensitivity — New Entity

  | Entity                    | Est. Volume (Year 1) | Retention  | Sensitivity |
  |---------------------------|----------------------|------------|-------------|
  | qdb_grid_column_config    | 2,000 records        | Indefinite | Internal    |

  No PII stored in configuration entities. Grid row data entered
  by portal users during form completion is transient client-side
  state until draft save or submission, at which point it is
  stored under the existing Draft Submission and Submitted Form
  Records entities (classified Confidential per Section 9 of v1.0).


B9. INTEGRATION DEPENDENCIES
─────────────────────────────────────────────────────────────────────
This addendum introduces one new integration pattern: the Selection
Grid (Mode A) issues OData queries against non-submission Dataverse
entities (product catalogues, branch lists, etc.) at form load time.
This is an extension of the existing Dataverse Web API integration,
not a new system dependency. All such queries are routed through the
existing backend API and are subject to the same authentication,
throttling, and retry logic as all other Dataverse calls.

| System              | Integration Type     | Data Exchanged                                               | Direction       |
|---------------------|----------------------|--------------------------------------------------------------|-----------------|
| Microsoft Dataverse | REST (OData Web API) | Selection Grid record queries (active records, filtered)     | Read (inbound)  |
| Microsoft Dataverse | REST (OData Web API) | Entry Grid child record creation on form submission          | Write (outbound)|


B10. OPEN QUESTIONS — RESOLVED
─────────────────────────────────────────────────────────────────────
All blocking questions resolved 2026-06-05.

| # | Question | Resolution | Date |
|---|---|---|---|
| Q-008 | Selection Grid filter: dynamic OData expression or static? | RESOLVED — No raw OData filter. Admin selects target entity then a saved Dataverse View. View owns the filter, columns, and sort. Removes need for FR-119 dynamic token syntax. | 2026-06-05 |
| Q-009 | Which Dataverse entities for Entry Grid child rows? | RESOLVED — Fully configurable. Form author defines target entity and relationship attribute in the qdb_grid_column_config configuration table. No hardcoded entities. | 2026-06-05 |
| Q-010 | Selection Grid >500 records: truncate or paginate? | RESOLVED — Paginate. Next/previous controls with configurable page size. NFR-019 applies per page load. | 2026-06-05 |
| Q-011 | Boolean field: no-default state acceptable? | ASSUMED — No-default (unset) state is acceptable. User must interact before submit if field is required. FR-092 stands. | 2026-06-05 |
| Q-012 | Does qdb_allow_save_draft already exist on qdb_form_definition? | RESOLVED — Confirmed exists. FR-139 references this attribute directly. | 2026-06-05 |
| Q-013 | Entry Grid rows editable after save-as-draft resume? | RESOLVED — Yes, rows are fully editable when form is resumed from draft. | 2026-06-05 |

| Q-014 | Entry Grid draft column-change policy: if a form author changes Entry Grid columns after a user has saved a draft, what happens on resume? | RESOLVED — Invalidate the draft for the affected tab and notify the user that the form was updated. User must re-enter Entry Grid rows. Option A confirmed by QDB 2026-06-06. (CEO condition ADD-002-C1) | 2026-06-06 |

B11. ASSUMPTIONS FOR THIS ADDENDUM
─────────────────────────────────────────────────────────────────────
AB-001: The boolean field type coexists with the existing checkbox
        field type. No existing checkbox field records in Dataverse
        will be migrated or retyped as part of this enhancement.

AB-002: The OData filter expression for Selection Grid is authored by
        the CRM Configuration Team and is validated for syntax at
        admin-screen save time. The portal does not attempt to parse
        or validate the expression at runtime; it passes it directly
        to the Dataverse Web API.

AB-003: Entry Grid child records are created in the same Dataverse
        environment as the parent submission record. Cross-environment
        child record creation is not a supported scenario.

AB-004: The qdb_button_design table already exists with at minimum the
        structural attributes (button_type picklist, label, style) as
        implied by the original v1.0 BRD button design reference.

AB-005: Final tab determination (BR-025) is computed at portal runtime
        from the loaded metadata. It is not stored as a flag on any
        record, and no pre-computation or caching of "is final tab" is
        performed.

AB-006: The WCAG 2.1 Level AA commitment from NFR-013 and NFR-017 is
        understood to extend to all new field types and controls
        introduced in this addendum, as stated in NFR-024.

AB-007: All grid field interactions (row add, delete, selection change)
        occur entirely within the current form session. There is no
        mechanism for a Relationship Manager or admin to add, edit, or
        delete Entry Grid rows after submission; the submitted child
        records are owned by Dataverse once created.


B12. CONSTRAINTS SPECIFIC TO THIS ADDENDUM
─────────────────────────────────────────────────────────────────────
C-ADD-001: The Selection Grid OData queries must respect Dataverse Web
           API throttling limits (C-004 in v1.0). Grid fields that
           require large result sets must use the qdb_grid_max_rows
           cap to limit query size. Pagination requiring multiple
           sequential API calls per grid load is architecturally
           discouraged and requires explicit ADR approval.

C-ADD-002: Entry Grid child record creation uses the same Dataverse
           Web API used for all submission writes. Batch creation of
           multiple child records must use the Dataverse batch request
           API ($batch endpoint) to minimise round-trip count and
           respect throttling limits.

C-ADD-003: The boolean field type must map to a Dataverse Two Options
           (boolean) attribute in the submission mapping. Mapping to
           any other attribute type is a configuration error. The admin
           screen must enforce this constraint at submission mapping
           save time.


B13. REQUIREMENTS TRACEABILITY — ADDENDUM DFE-ADD-002
─────────────────────────────────────────────────────────────────────
| User Story | Functional Requirements                                                                  | Business Objective      | Test Cases       | Status |
|------------|------------------------------------------------------------------------------------------|-------------------------|------------------|--------|
| US-18      | FR-088, FR-089, FR-090, FR-091, FR-092, FR-093, FR-094, FR-095, FR-096, FR-097, FR-098   | BO-001, BO-009          | TC-083 (pending) | Draft  |
| US-19      | FR-093, FR-094, FR-095, FR-096, FR-099, FR-100, FR-101, FR-102                           | BO-002, BO-009          | TC-084 (pending) | Draft  |
| US-20      | FR-103, FR-104, FR-105, FR-106, FR-107, FR-111, FR-112, FR-113, FR-114, FR-116, FR-117   | BO-001, BO-010          | TC-085 (pending) | Draft  |
| US-21      | FR-103, FR-104, FR-105, FR-108, FR-120, FR-121, FR-122, FR-123, FR-124, FR-125, FR-126   | BO-001, BO-011          | TC-086 (pending) | Draft  |
| US-22      | FR-128, FR-129, FR-130                                                                   | BO-002                  | TC-087 (pending) | Draft  |
| US-23      | FR-139, FR-140, FR-145, FR-146, FR-149, FR-150                                           | BO-002, BO-012          | TC-088 (pending) | Draft  |
| US-24      | FR-141, FR-142, FR-143, FR-147, FR-148, FR-149, FR-151                                   | BO-002, BO-012          | TC-089 (pending) | Draft  |
| US-25      | FR-144, FR-141                                                                           | BO-001, BO-012          | TC-090 (pending) | Draft  |
| US-18–25   | FR-115, FR-118, FR-119, FR-127, FR-131, FR-132, FR-133, FR-134, FR-135                   | BO-002, BO-003          | TC-091 (pending) | Draft  |
| US-18–25   | FR-136, FR-137, FR-138, FR-152, FR-153                                                   | BO-001, BO-004          | TC-092 (pending) | Draft  |


B14. ADDENDUM APPROVAL
─────────────────────────────────────────────────────────────────────
| Role              | Name              | Decision  | Date       |
|-------------------|-------------------|-----------|------------|
| CEO               | Maqsad AI — CEO   | PENDING   |            |
| Requestor (QDB)   | Pending           | PENDING   |            |
| BA                | Maqsad AI — BA    | SUBMITTED | 2026-06-05 |

═══════════════════════════════════════════════════
END OF ADDENDUM — DFE-ADD-002
═══════════════════════════════════════════════════
