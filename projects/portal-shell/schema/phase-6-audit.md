# Phase 6 — Security Audit
## DFE-PORT-001/SCHEMA · Portal Shell Dataverse Provisioning Script

**Auditor Agent**  
**Date:** 2026-06-16  
**Engagement:** DFE-PORT-001/SCHEMA  
**Scope:** `projects/portal-shell/scripts/provision-schema/` — all source files, configuration, and emitted artefacts  
**Build ref:** Phase 4 Tech + Phase 5 Code Review + Phase 5 QA (63 tests passing)

---

## Verdict

**CONDITIONAL PASS — 1 MEDIUM, 2 LOW findings. No HIGH or CRITICAL findings.**

The provisioning script is structurally secure. Authentication uses MSAL OAuth 2.0 client credentials flow; secrets are never logged; bcrypt cost factor 12 is appropriate; all OData filters use constants or Zod-validated values with no injection path. Three findings require remediation before first production use, two of which are fixed in this audit cycle.

---

## Findings

### A-SCHEMA-001 — MEDIUM: Real environment identifiers in `.env.example`

**File:** `.env.example`  
**Status:** REQUIRES FIX (operator action — see recommendation)

**Detail:**  
The committed `.env.example` contains real values for `DATAVERSE_ORG_URL`, `DATAVERSE_CLIENT_ID`, and `DATAVERSE_TENANT_ID`:

```
DATAVERSE_ORG_URL=https://org5869857f.crm4.dynamics.com
DATAVERSE_CLIENT_ID=08e80e93-0bab-45ef-8372-2e554fa9af9b
DATAVERSE_TENANT_ID=d79e793c-f6de-4204-8508-7980a63df957
```

The `.env.example` file is committed to source control and visible to anyone with repository access. While `DATAVERSE_CLIENT_SECRET` is correctly redacted, exposing the org URL, application client ID, and tenant ID provides an attacker with three of the four OAuth inputs needed to probe the Dataverse org or mount a targeted credential-stuffing attack.

`DATAVERSE_CLIENT_SECRET` is the only value that cannot be obtained without access to Azure, but exposing the other three values is unnecessary and violates the principle of least information disclosure.

**Recommendation:**  
Replace real values with typed placeholders in `.env.example`:

```env
DATAVERSE_ORG_URL=https://<your-org>.crm4.dynamics.com
DATAVERSE_CLIENT_ID=<UUID from Azure App Registration>
DATAVERSE_CLIENT_SECRET=<secret from Azure App Registration — never commit>
DATAVERSE_TENANT_ID=<UUID from Azure Active Directory>
```

This is an operator/configuration change. The real values should be stored only in the local `.env` file (which must be in `.gitignore`).

---

### A-SCHEMA-002 — LOW: `Retry-After` header value has no maximum cap

**File:** `src/http/DataverseHttpClient.ts:98–100`  
**Status:** FIXED IN THIS AUDIT CYCLE

**Detail:**  
```typescript
const retryAfterHeader = response.headers.get('Retry-After');
const waitSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
await sleep(waitSeconds * 1000);
```

If the Dataverse service returns an unexpectedly large `Retry-After` value (or if a network proxy injects a malicious header), the script could stall indefinitely between retries. `parseInt` also returns `NaN` if the header is non-numeric, which would make `NaN * 1000 = NaN` and `setTimeout(fn, NaN)` behave as `setTimeout(fn, 0)` — effectively bypassing the backoff.

**Fix applied:**  
```typescript
const rawWait = parseInt(retryAfterHeader ?? '', 10);
const waitSeconds = Number.isFinite(rawWait) ? Math.min(rawWait, 120) : 5;
```
Cap at 120 seconds. Treat non-numeric header as 5-second default.

---

### A-SCHEMA-003 — LOW: Org URL hardcoded in emitted `PROVISIONING-COMPLETE.md`

**File:** `src/output/ProvisioningCompleteEmitter.ts:51`  
**Status:** FIXED IN THIS AUDIT CYCLE

**Detail:**  
The PAC CLI export command in the emitted file hardcodes the org URL:
```typescript
pac auth create --url https://org5869857f.crm4.dynamics.com
```

If the script is ever run against a different environment (e.g., UAT, production), the generated checklist file would contain the wrong org URL, leading an operator to authenticate against the wrong environment. The org URL is already available via `env.DATAVERSE_ORG_URL`.

**Fix applied:** `env.DATAVERSE_ORG_URL` substituted for the hardcoded URL.

---

## Informational Notes (no code change required)

### A-SCHEMA-004: Column security manual step is a production blocker

`qdb_auth_config_json` on `qdb_portal_configs` stores auth provider credentials (clientId, clientSecret for the chosen auth provider). Without a Column Security Profile, any Dataverse user with Read access to the entity can read these values in plaintext JSON.

The script correctly:
- Documents this in `PROVISIONING-COMPLETE.md` (C-SCHEMA-006)
- References the manual Power Apps steps in `printSolutionExportInstruction()`

This is a deployment gate. It must be completed before any portal environment is exposed to end users. **It must appear on the pre-production checklist and have a sign-off from the project lead.**

---

### A-SCHEMA-005: Smoke test user must be deactivated before production

`smoketest@portalshell.internal` is seeded with a bcrypt-hashed password. If not deactivated before production promotion, it is a low-privilege but valid portal credential accessible to anyone who reads the seed script.

The script warns about this in PHASE-10 output and in `PROVISIONING-COMPLETE.md`. **Sign-off is required on this item before production go-live.**

---

### A-SCHEMA-006: No structured audit log for provisioning operations

The script uses `console.log` throughout. For compliance environments that require an audit trail of which scripts ran against which org and when (e.g., Power Platform CAF controls), the console output should be redirected to a file and stored with the `PROVISIONING-COMPLETE.md` artefact.

Mitigation: pipe stdout/stderr to a log file at invocation time:
```bash
npm run provision 2>&1 | tee provision-$(date +%Y%m%d-%H%M%S).log
```

No code change required.

---

## Security Controls — Verified Pass

| Control | Verification | Result |
|---------|-------------|--------|
| Credentials never in source | `.env.example` has placeholder for secret; all secrets from env vars | PASS |
| Secrets never logged | `DATAVERSE_CLIENT_SECRET` and `SEED_TEST_USER_PASSWORD` — no log statement references them | PASS |
| Bearer token never logged | DEBUG mode logs operation name only, never the Authorization header value | PASS |
| bcrypt cost factor ≥ 10 | Cost factor 12 in `TestUserSeed.ts` | PASS |
| bcrypt loaded only when needed | Dynamic import in `hashPassword()` — not loaded on DRY_RUN path | PASS |
| No OData filter injection | All filter values are hardcoded constants or Zod-validated UUIDs — no user-supplied data reaches any filter | PASS |
| No SQL (N/A) | OData v4 API only | PASS |
| No eval() or dynamic code | Not present | PASS |
| MSAL client credentials flow | `ConfidentialClientApplication` with `acquireTokenByClientCredential` | PASS |
| 401 token refresh | `executeWithRetry` re-acquires token on first 401 | PASS |
| 429 rate limit respected | `Retry-After` header honoured (capped at 120s post-fix) | PASS |
| 503 exponential backoff | 2s → 4s → 8s, max 3 retries | PASS |
| Service principal least privilege | C-SCHEMA-004: System Administrator role blocked by `runServicePrincipalRoleCheck` | PASS |
| Append-only table protection | C-SCHEMA-003: Write and Delete absent from privilege matrix for 3 entities | PASS |
| Solution isolation | `MSCRM.SolutionUniqueName: QdbPortalShell` on every POST/PATCH/DELETE | PASS |
| Idempotent operations | Entity, role, and seed checks skip existing records | PASS |
| DRY_RUN blocks all mutations | `if (env.DRY_RUN)` guards in every provisioner | PASS |
| No hardcoded GUIDs in logic | Mock publisher ID is dry-run-only, clearly labelled | PASS |
| Process exit on env failure | Zod `envSchema.parse()` throws at module load → `process.exit(1)` | PASS |
| Process exit on validation failure | `failedChecks.length > 0` → `process.exit(1)` in `main()` | PASS |
| OData URL built safely | `new URL(path, BASE_URL)` + `URLSearchParams` — no string concatenation in URL construction | PASS |

---

## Summary

| Severity | Count | Disposition |
|----------|-------|-------------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 1 | A-SCHEMA-001 — operator fix required (`.env.example` values) |
| LOW | 2 | A-SCHEMA-002 FIXED, A-SCHEMA-003 FIXED |
| INFORMATIONAL | 3 | A-SCHEMA-004, A-SCHEMA-005, A-SCHEMA-006 — documented, no code change |

**Audit conditions before script execution:**
1. A-SCHEMA-001: Replace real identifiers in `.env.example` with placeholders (operator action)
2. A-SCHEMA-004: Column security profile for `qdb_auth_config_json` applied immediately after script run (deployment gate, sign-off required)
3. A-SCHEMA-005: `smoketest@portalshell.internal` deactivated before production go-live (deployment gate, sign-off required)

---

*Next phase: Phase 7 — CEO Final Decision*
