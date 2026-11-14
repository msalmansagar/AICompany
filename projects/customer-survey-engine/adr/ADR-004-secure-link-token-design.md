# ADR-004 — Secure-link token design

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Decided by | architect; confirmed by the NFR-CSE-009 security review before enablement |
| Relates to | FR-CSE-050, 054; NFR-CSE-009; C-3; §8 |

## Context

The Secure-link delivery channel sends a customer a link they open **without
logging in**, but the access is **not anonymous** (C-3): the link must identify
exactly one invitation and one customer. Options: a self-contained JWT carrying
the invitation id, or an opaque random token resolved server-side. A JWT cannot
be made single-use without server state anyway, and embeds data in a string that
leaves QDB's control.

## Decision

Use an **opaque random token**: 256 bits from `RandomNumberGenerator`,
Base64URL-encoded. Store only **`SHA-256(token)`** on the invitation
(`qdb_token_hash`, alternate key); the plaintext exists only in the sent link and
is never persisted or logged (ANTI-005). The token is **single-use** (cleared via
`qdb_token_used_on` and status→Submitted) and **expiring** (valid only while the
invitation is Pending and before `qdb_expires_on`). `qdb_srv_ValidateLinkToken`
hashes the presented token and looks it up by the alternate key.

The channel is **disabled by default** per org (`qdb_securelink_enabled = false`)
until the NFR-CSE-009 threat model + security review signs off entropy, expiry,
single-use and guess-rate.

## Consequences

- No business data in the token; a database leak exposes only hashes.
- O(1) validation via the alternate key; no JWT key management.
- Guess-rate enforcement depends partly on the **portal** rate-limiting the
  validate call — a boundary the security review must confirm (Skeptic ch. 4),
  since the portal is QDB-built and outside MSS control (OQ-A2f).
- Revocation = expiring/closing the invitation; there is no token blocklist.
