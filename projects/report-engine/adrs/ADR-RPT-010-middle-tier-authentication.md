# ADR-RPT-010 — Middle-tier authentication: dual scheme, caller derived from validated credentials

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-26 |
| **Decided by** | Architect + user (MSS Technologies) |
| **Supersedes** | Nothing. Implements the auth line of `phase-3-arch.md` §364/§503. |
| **Closes** | Blocker **B1** from `phase-6-code-review-audit.md` |

## Context

The middle-tier had no authentication on any route. It took the acting user from a raw
`X-Report-Caller-Id` request header and impersonated that user in Dataverse via `MSCRMCallerID`.
Anyone who could reach the service could therefore name any user — including a system administrator —
and read or export that user's data. The audit rated this a complete access-control bypass
(OWASP A01/A07) and the single hardest blocker to production.

The architecture had already specified the intended posture: *"Auth on all middle-tier endpoints:
Bearer token (Entra ID on cloud; internal service-account HMAC token on-prem). The CRM entry point
acquires/generates this token — the browser never holds it"* (§503), with the scheme
*"configured per target"* (§364). The implementation had diverged from it because the designer and
runtime web resources call the middle-tier directly from the browser.

Two constraints shaped the decision:

1. **V1 must run on on-premise CRM 9.x as well as Dataverse cloud.** On-prem has no Entra tenant, so
   a pure Entra JWT scheme cannot authenticate an on-prem user at all.
2. **The engine is delivered as a web resource inside CRM.** The browser is the immediate caller
   today, and on-prem it has no way to mint a token for a third-party API.

## Decision

Authenticate every endpoint, and derive the acting user only from validated credentials. Two schemes
are registered, selected per request by the `Authorization` header and enabled independently by
configuration, so one deployment can serve both targets:

| Scheme | Target | Credential | Acting user comes from |
|---|---|---|---|
| `Bearer` (Entra ID JWT) | Dataverse cloud | Entra-issued access token | the validated `oid` claim |
| `ServiceToken` | On-premise CRM 9.x | shared secret held by the CRM entry point | the user the relay names |

The rule that makes this safe is a single one, implemented in `CallerIdentityPolicy` in Core:

- **Only a trusted service identity may name the acting user.** The CRM entry point establishes the
  user's identity from the CRM session before relaying, so its assertion is meaningful.
- **Every other caller acts strictly as the subject of its own token.** A user token that names a
  different user is refused with `impersonation_not_permitted`, not honoured.
- **A trusted relay must always name a user.** It may not fall back to running as itself — that
  would execute the report with service-account privileges and silently bypass the row-level
  security the whole per-user execution model depends on.
- **An unauthenticated request cannot choose an identity at all**, which is precisely the property
  that was missing.

`X-Report-Caller-Id` survives as the transport for the assertion, but it is now untrusted input that
is only read after the caller has proved it is a trusted relay.

### Supporting decisions

- **Fail closed at startup.** A deployment that enables no scheme refuses to boot, mirroring the
  existing CORS guard. An enabled scheme missing its `Authority`/`Audience`/`Secret` also refuses.
- **A Development-only anonymous scheme** keeps local work friction-free. It cannot be enabled
  outside Development — that combination throws at startup rather than being quietly downgraded.
- **Resolution runs once per request in a global filter**, not per controller. With thirteen actions
  needing the same decision, a per-controller helper would be thirteen chances to omit the check.
- **HSTS and HTTPS redirection** outside Development, so neither credential crosses the wire in clear.

## Consequences

**Positive.** The forgeable-identity bypass is closed on both targets. Per-user security is
unchanged and still enforced — a named user with no roles is still refused by Dataverse itself.
The audit's B1 is resolved in code.

**The cost, stated plainly.** Once the middle-tier demands credentials, the web resources need a way
to obtain them, and today they send none. In Development they keep working via the anonymous scheme;
in any real deployment they will receive `401` until one of these is built:

- **Cloud:** acquire an Entra token in the web resource (MSAL.js against an app registration
  exposing an API scope) and send it as `Bearer`.
- **On-premise:** route the calls through the `qdb_RunReport` Custom API, which holds the service
  secret and relays — the arch-faithful path, requiring the Custom API surface to grow from
  run/export to the designer's full CRUD, chart and drilldown surface.

This ADR deliberately does not choose between those. It builds the server side both of them need, so
that choice can be made against working code rather than ahead of it.

**Deferred.** On-behalf-of (OBO) token exchange remains unbuilt and is gated on the compliance region
sign-off (AUTH-C-2), not on this decision. Rotating the service secret is an operational concern with
no automation yet.

## Configuration

```jsonc
{
  "Auth": {
    "EntraJwt":     { "Enabled": true, "Authority": "https://login.microsoftonline.com/<tenant>/v2.0", "Audience": "<api-app-id-uri>" },
    "ServiceToken": { "Enabled": true, "Secret": "<from environment or user-secrets — never committed>" },
    "AllowAnonymousDevelopment": false
  }
}
```

Environment-variable form uses the ASP.NET double-underscore convention, e.g.
`Auth__ServiceToken__Secret`. For local work, set `Auth__AllowAnonymousDevelopment=true` and
`Auth__DevelopmentCallerId=<a real systemuser id>` so a local run impersonates a genuine user rather
than running with service privileges.

## Verification

Unit tests cover the policy decision (9 cases, including every refusal). Integration tests boot the
real pipeline and assert the routes themselves are protected (7 cases), because a correct policy is
worth nothing if a route bypasses it.

Live-verified against org5869857f on 2026-07-26:

| Request | Result |
|---|---|
| No credentials | `401` |
| `X-Report-Caller-Id` alone (the pre-B1 hole) | `401` |
| Wrong service secret | `401` |
| Valid relay naming no user | `400 invalid_request` |
| Valid relay naming a system administrator | `200`, 6 reports; report execute returned 5 rows |
| Valid relay naming a user with no roles | `403 permission_denied` — per-user security intact |
| `/health` without credentials | `200` (deliberately anonymous) |
| `AllowAnonymousDevelopment` in Production | refuses to start |
