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
END OF DOCUMENT
═══════════════════════════════════════════════════
