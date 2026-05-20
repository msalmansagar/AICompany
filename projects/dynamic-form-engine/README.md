# Dynamic Form Engine Portal

A metadata-driven React portal that renders any banking form from Dataverse configuration — zero frontend code changes needed to add new forms.

## Architecture

```
Browser (React SPA)
    │  Azure AD PKCE auth
    ▼
Express API (Node.js + TypeScript)
    │  Bearer token validation
    │  LRU metadata cache
    ▼
Dataverse Web API (OData v4)
    └── 12 configuration tables (qdb_form_*)
    └── Submission records
    └── Audit log (append-only)
```

## Project Structure

```
dynamic-form-engine/
├── frontend/          React 18 + TypeScript + Fluent UI v9
├── backend/           Node.js + Express + TypeScript
├── shared/            Shared TypeScript interfaces
├── docs/              Architecture docs and diagrams
└── scripts/           CRM seed data, deploy scripts
```

## Quick Start

### Prerequisites
- Node.js 20+
- Access to a Dataverse environment (or use MOCK_CRM=true for local dev)
- Azure AD app registration

### 1. Install dependencies

```bash
# Shared types
cd shared && npm install && npm run build

# Backend
cd ../backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your Dataverse URL, Azure AD credentials

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your Azure AD client ID and tenant
```

### 3. Run in local mock mode (no Dataverse required)

```bash
# Terminal 1 — backend with mock CRM
cd backend && MOCK_CRM=true npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:5173

### 4. Run against real Dataverse

1. Seed the metadata tables:
   ```bash
   cd scripts && npx ts-node seed-crm-metadata.ts
   ```

2. Start backend:
   ```bash
   cd backend && npm run dev
   ```

3. Start frontend:
   ```bash
   cd frontend && npm run dev
   ```

## Key Concepts

### Metadata-Driven Rendering
Forms are defined entirely in Dataverse configuration tables:
- `qdb_form_definition` → root form record
- `qdb_form_tab` → tabs within the form
- `qdb_form_section` → sections within each tab
- `qdb_form_field` → fields within each section
- `qdb_form_validation_rule` → validation rules per field
- `qdb_form_business_rule` → conditional visibility/required rules
- `qdb_form_option_value` → dropdown/radio options
- `qdb_form_lookup_config` → lookup field configuration
- `qdb_form_submission_mapping` → maps form fields to Dataverse attributes

### Rule Engine
Uses `json-rules-engine` to evaluate conditional rules in the browser in real time.
Rules fire on every field value change (debounced 150ms).
Supported actions: show/hide field/section/tab, make required/optional/readonly,
set/clear/calculate value, filter options.

### Validation Engine
Zod schemas are built at runtime from metadata `ValidationRule` records.
Validation runs on field blur and on submit attempt.
Server-side re-validation happens in the backend before writing to Dataverse.

### Submit Flow
1. Full client-side validation pass
2. Hidden field values cleared
3. POST to `/api/forms/{formCode}/submit`
4. Backend creates parent CRM record
5. Backend creates child CRM records (linked to parent)
6. Power Automate flow triggered (fire-and-forget)
7. Audit log entry written
8. Confirmation screen shown with CRM reference number

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forms/:formCode/metadata` | Full form definition JSON |
| GET | `/api/forms/:formCode/data/:recordId` | Load existing CRM record |
| POST | `/api/forms/:formCode/draft` | Save/update draft |
| POST | `/api/forms/:formCode/submit` | Final submission |
| POST | `/api/forms/:formCode/validate` | Server-side validation only |
| GET | `/api/forms/:formCode/versions` | Version history |
| GET | `/api/lookups/:entityName` | Lookup type-ahead search |
| GET | `/api/options/:fieldId` | Field option values |
| POST | `/api/files/upload` | Document upload |
| GET | `/api/health` | Health check |

## Environment Variables

See `backend/.env.example` and `frontend/.env.example`.

## Testing

```bash
# Backend unit tests
cd backend && npm test

# Frontend component tests
cd frontend && npm test

# E2E (Playwright)
cd frontend && npm run test:e2e
```

## Deployment

See `docs/deployment-guide.md`.

Docker images are built by the GitHub Actions pipeline on every tagged release.

## Adding a New Form

1. Create a `qdb_form_definition` record in Dataverse with a unique `qdb_form_code`
2. Add `qdb_form_tab`, `qdb_form_section`, `qdb_form_field` records
3. Add validation and business rules
4. Add submission mappings
5. Set status to Active

The form is immediately available at `/form/{formCode}` — no code deployment required.
