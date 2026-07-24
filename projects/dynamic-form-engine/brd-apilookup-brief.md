# DFE-APILOOKUP-001 — API-Sourced Lookup Field
## Executive Brief

**Feature:** Allow a `lookup` (or `multiLookup`) field to source its selectable
records from an external REST API, chosen by the maker per field. Today every
lookup sources records from a CRM/Dataverse entity.

**Problem solved:** Forms that require data from external systems (HR directories,
product catalogues, ERP stock lists, partner registries) force workarounds —
static options that go stale or a manual CRM sync. Makers need a first-class
path to wire a lookup to an external API without touching code.

**Security constraint (hard, non-negotiable):** The browser never calls the
external URL. The form maker never types a URL. The maker picks a pre-registered
key; the Node backend resolves that key to an internal allowlist entry and proxies
the call server-side, then forwards normalised `LookupResult[]` to the browser.
This mirrors the `endpointKey` intent already present in `CallApiActionConfig` in
`shared/src/types/form.types.ts`, but neither the lookup nor button-action path
has a backend endpoint-registry implementation yet — this feature is the first to
build one.

**Scope:** Extends the existing `LookupConfig` type with a `source` discriminator
(`'entity'` / `'api'`). Entity-sourced lookup behaviour is completely unchanged.
API-sourced lookup adds a backend proxy route, a registry mechanism, and new
config fields in `qdb_form_lookup_configs`. Both the Node `CrmMetadataService`
and the C# `FieldBuilder.BuildLookupConfig()` must be updated — the C# path
handles the in-CRM render-cache and has been a real last-mile gap on prior
features.

**Open questions for CEO:**
1. Endpoint registry mechanism: environment-variable JSON map (simpler, DevOps-managed)
   vs a Dataverse entity `qdb_api_endpoint_registry` (maker-manageable without
   redeployment). Which governance model is acceptable?
2. Search strategy default: `typeahead` (passes search term to the external API on each
   keystroke — requires the external API to support a search param) vs `fetchAll` (loads
   all records once, then filters client-side — simpler but high-volume risk). Should one
   be the mandated default or should the maker choose per field?
3. PII/data-egress: responses from external APIs may contain personal data. Does the form
   engine need to log request/response bodies, or must it scrub them for PDPPL compliance?
4. Caching: should API-lookup results be cached server-side (TTL, invalidation trigger)?
   What is the acceptable staleness window for a typical use case?
5. Rate-limiting: who owns the rate-limit budget for the external API? Is per-form-code
   throttling on the Node backend acceptable, or does the external API have its own OAuth
   client that must be configured per endpoint?
