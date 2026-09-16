# @dcp/auth-adapters

Pluggable auth adapter for the DCP CRM Context Router (ADR-DCP-04).

## Adapters

| Adapter | When | Auth Provider |
|---|---|---|
| `AdfsAdapter` | Phase 1 (on-premise) | AD FS 2019 via OIDC discovery |
| `AzureAdAdapter` | Post-migration (~Q1 2028) | Entra ID via OIDC discovery |

Both adapters implement `IAuthAdapter`:

- `getServiceToken(org)` — client_credentials grant for router → CRM S2S calls
- `validateUserToken(jwt)` — validates user bearer tokens via the issuer JWKS

## COND-DCP-008: AD FS 2019 verification required

**This adapter has NOT been proven against a real AD FS 2019 endpoint.**
Before Phase 1 ships, the DevOps team must verify `AdfsAdapter` against the
client's live AD FS instance and confirm:

1. The discovery document is reachable at `<issuerUrl>/.well-known/openid-configuration`
2. `client_secret_post` is an accepted token-endpoint auth method
3. The client_credentials grant works with the CRM resource scope

**If AD FS requires certificate-based client assertion (S2S certificate flow):**
The `AdfsAdapter` currently passes `clientSecret` to openid-client's `discovery()`.
A certificate flow needs a different `clientAuthentication` option passed to
openid-client's `Configuration` constructor. This is the documented seam —
extend `AdfsAdapter` with `certClientAssertion?: { key: string; cert: string }`
in `AdfsAdapterConfig` and wire it to openid-client's `PrivateKeyJwt` or
`TlsClientAuth` method when present.

## Environment variables (set by `apps/api/src/config.ts`)

| Variable | Purpose |
|---|---|
| `AUTH_PROVIDER` | `adfs` or `azure-ad` |
| `AUTH_ISSUER_URL` | OIDC discovery base URL |
| `DV_CLIENT_ID` | HL org service principal client ID |
| `DV_CLIENT_SECRET` | HL org service principal client secret |
| `DV_SCOPE` | HL org token scope (e.g. `https://hl-crm.example.com/.default`) |

## Tests

Tests use an in-process mock OIDC issuer (`src/__tests__/mock-oidc-issuer.ts`)
that exposes a real discovery document, JWKS endpoint, and token endpoint.
This proves the OIDC flow without depending on a live AD FS or Azure AD instance.
