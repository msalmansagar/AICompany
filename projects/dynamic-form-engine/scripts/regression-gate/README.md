# Render-Cache Content Regression Gate (FR-CSE-025)

Prevents a DFE deployment from silently altering the published JSON of any existing
form.  Every DFE deploy that may touch the render-cache output — including the Save-defect
fix (FR-CSE-024, section 5.4 of the architecture) — must pass this gate before shipping.

---

## Why this gate exists

The DFE publish plugin writes a compressed JSON blob per form + language into
`qdb_form_render_cache.qdb_runtime_json`.  A previous incident (ARC-M-002) showed that
a code change in the shared publish path silently dropped fields from the cache while
all unit tests remained green.  This gate makes that class of regression mechanically
detectable: it compares decoded cache content before and after a deploy, failing the
release if any existing form changes.

---

## Gate procedure

Run every step from the **repository root**.  The `.env` file at
`projects/dynamic-form-engine/scripts/.env` must supply the credentials for the target org.

### Step 1 — Capture the baseline (BEFORE the DFE deploy)

```
node --env-file=projects/dynamic-form-engine/scripts/.env \
  projects/dynamic-form-engine/scripts/regression-gate/index.mjs \
  capture --out baseline-pre-deploy.json
```

This reads every active row from `qdb_form_render_caches` (`qdb_is_active eq true AND
qdb_status eq 2`), decodes each Base64+gzip blob, and writes a plain JSON file.  It
makes **no changes** to the org.

### Step 2 — Deploy the DFE

Import the new DFE solution package into the target org.  Do not activate the
SurveyEngine solution yet.

### Step 3 — Re-publish all forms

Re-publish every form so the freshly deployed plugin regenerates the cache blobs.
Use the existing `republish-cached-forms.mjs` script:

```
node --env-file=projects/dynamic-form-engine/scripts/.env \
  projects/dynamic-form-engine/scripts/republish-cached-forms.mjs
```

This is a live write operation and requires separate go-ahead per the project rules.
Wait for all publish jobs to complete (check `qdb_publish_jobs` or the script output).

### Step 4 — Capture the current state (AFTER the DFE deploy + re-publish)

```
node --env-file=projects/dynamic-form-engine/scripts/.env \
  projects/dynamic-form-engine/scripts/regression-gate/index.mjs \
  capture --out baseline-post-deploy.json
```

### Step 5 — Compare

```
node --env-file=projects/dynamic-form-engine/scripts/.env \
  projects/dynamic-form-engine/scripts/regression-gate/index.mjs \
  compare \
    --baseline baseline-pre-deploy.json \
    --current  baseline-post-deploy.json
```

**Exit code 0** — no regressions; the release may proceed to SurveyEngine deployment.  
**Exit code 1** — regressions detected; the release is **BLOCKED** until differences
are investigated and resolved.

Alternatively, capture-and-compare in one step by omitting `--current`:

```
node --env-file=projects/dynamic-form-engine/scripts/.env \
  projects/dynamic-form-engine/scripts/regression-gate/index.mjs \
  compare --baseline baseline-pre-deploy.json --current live
```

---

## Comparison semantics

### What is compared

Each entry is matched by **(formCode, language)**.  The published version number is
intentionally excluded from the match key because re-publishing increments it; the gate
checks **content**, not version numbers.

### Volatile stamps (stripped before comparing)

The following fields are present in every cache blob but carry per-publish metadata
rather than form content.  Differences in these fields do not indicate a regression.

| Field name | Variants stripped |
|---|---|
| **Emitted today** (FormDefinitionModel.cs): form version, last modified | `version`, `modifiedAt` |
| Publish timestamp (defensive alias) | `qdb_published_on`, `publishedOn`, `published_on` |
| Generation timestamp | `qdb_last_generated_on`, `lastGeneratedOn`, `last_generated_on`, `generatedOn`, `generated_on` |
| Generator build version | `qdb_generator_version`, `generatorVersion`, `generator_version` |
| Generation duration | `qdb_generation_duration_ms`, `generationDurationMs`, `generation_duration_ms` |

If a future generator version adds new metadata fields that should also be excluded,
pass them with `--strip-extra-stamps`:

```
... compare --baseline a.json --current b.json --strip-extra-stamps myNewTimestamp,anotherKey
```

The list is kept explicit and narrow — a heuristic pattern-match (e.g. strip anything
ending in `_on`) would risk silently ignoring real content regressions.

### Outcomes

| Outcome | Meaning | Blocks release? |
|---|---|---|
| Changed forms | The normalised content differs for a form that existed in both snapshots | **Yes** |
| Removed forms | A form present in the baseline is absent from the current snapshot | **Yes** |
| Added forms | A new form appears in the current snapshot that was not in the baseline | No — reported for information |

---

## Running the tests

No additional packages are required.  Uses `node:test` (Node 18+, built-in).

```
node --test \
  projects/dynamic-form-engine/scripts/regression-gate/__tests__/regression-gate.test.mjs
```

The tests use fixtures built entirely in-memory (gzipSync + base64) — no live org
calls are made.

---

## On-prem note (Dynamics CRM 9.1)

On-prem 9.1 orgs reject the `/api/data/v9.2/` endpoint with HTTP 500 (confirmed in
project memory — `on-prem 9.1 v9.2→500 FIXED`).  When targeting an on-prem org, set:

```
DV_API_VERSION=v9.1
```

in `scripts/.env` before running the capture commands.

Authentication for on-prem uses Windows / AD FS credentials rather than the
Azure AD client-credentials flow used here.  If on-prem capture is required,
provide an alternative `auth.mjs` that uses the appropriate auth mechanism
and document the swap in this README.

---

## File layout

```
regression-gate/
├── README.md               This file — gate procedure and reference
├── index.mjs               CLI entry: capture | compare commands
├── capture.mjs             Reads active render-cache rows; writes baseline JSON
├── compare.mjs             Loads two baselines; runs the content comparison
└── lib/
    ├── volatile-stamps.mjs  Explicit list of stamps to strip before comparing
    ├── decode.mjs           Base64 + gunzip → parsed JSON (throws on corruption)
    ├── normalise.mjs        Deep-strips volatile stamps; never mutates input
    ├── diff.mjs             Structural deep-diff returning JSON-path findings
    ├── auth.mjs             Azure AD client-credentials token helper
    └── dataverse.mjs        OData read of qdb_form_render_caches
```
