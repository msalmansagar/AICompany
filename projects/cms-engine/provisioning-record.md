# CMS-ENG-001 — schema provisioning record

**Environment:** `org5869857f.crm4.dynamics.com` (Dataverse cloud)
**Solution:** `MssCmsEngine` v1.0.0.0 · publisher `MSST`, prefix `msst`
**Date:** 2026-08-11 · **Authorised by:** Phase 3 architecture gate, condition G-2

---

## Verified state

Produced by `scripts/verify-cms-schema.mjs`, which exits non-zero on failure.

```
Entities exist
  PASS  msst_cmspage            PASS  msst_cmsicon
  PASS  msst_cmspageversion     PASS  msst_cmsthemetoken
  PASS  msst_cmsrendercache     PASS  msst_cmsnavigation
  PASS  msst_cmspublishlog      PASS  msst_cmsapprovalroute
  PASS  msst_cmsmediaasset      PASS  msst_cmsapproval

AC-08.1 — payload columns at the Memo maximum
  PASS  msst_cmspageversion.msst_contentjson  MaxLength = 1048576
  PASS  msst_cmsrendercache.msst_runtimejson  MaxLength = 1048576
  PASS  msst_cmsnavigation.msst_treejson      MaxLength = 1048576

All checks passed.
```

**10 entities, 33 columns.** Nothing else in the org was touched.

---

## What was deliberately not created

**`msst_cmsmediaasset` has no binary column.** Gate condition **G-1** must first
decide File column versus note attachment, and that decision changes FR-21's
reference counting. Provisioning a File column now would presume the answer to
the one question `q-4-onprem-capability.md` says is unconfirmed.

The rest of the entity exists — asset key, kind, and bilingual alt text — so the
media library's metadata model is in place and only the binary store is pending.

---

## G-2 evidence, captured before anything was created

The prefix check was run against the org rather than asked of QDB:

| Check | Result |
|---|---|
| Publisher with prefix `msst` | **`MSST` — "MSS Technologies"**, already present |
| Existing `msst_*` entities | **0** |
| Existing solution for the CMS | none |

**This satisfies G-2 for `org5869857f` only.** QDB's on-premise and production
environments are unverified, and a prefix cannot be changed once records exist,
so the check is repeated per environment before provisioning into it.

While there, `qdb_cms_contents` was checked for §8: it exists and holds **0
rows**, confirming by query what §8 had concluded from deployment documents.

---

## Two Dataverse behaviours worth not rediscovering

Both cost a failed run before being handled, and both are now retried with
backoff in `provision-cms-schema.mjs`.

**1 — `ECONNRESET` on entity creation.** Creating an entity takes long enough
that the socket is dropped. **The entity is usually created anyway**, so failure
is not assumed — existence is re-checked before the error propagates.

**2 — `0x80040216` "An unexpected error occurred" when adding a column.**
Returned when an attribute is added to an entity Dataverse has not finished
settling. It hit three different columns across runs and succeeded on retry every
time, which is what identifies it as timing rather than a bad definition. A
five-second pause after entity creation makes it rarer; the retry makes it
harmless.

**Neither is a reason to create schema by hand.** They are a reason for the
script to be idempotent, which is what let a killed run be resumed by simply
running it again.

---

## Reproducing

```
node --env-file=<path>/.env projects/cms-engine/scripts/provision-cms-schema.mjs
node --env-file=<path>/.env projects/cms-engine/scripts/verify-cms-schema.mjs
```

Provisioning is idempotent — an entity or column that exists is skipped, never
recreated. Verification is read-only and safe to run at any time; it belongs in
the Phase 4 pipeline, because AC-08.1's failure mode is silent.
