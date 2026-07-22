# @edp/sdk — EDP Decision SDK (TypeScript)

A thin, typed client for the [Decision Gateway](../../gateway). Per **ADR-EDS-09** the SDK is an
**envelope builder only** — it assembles the canonical request, calls
`POST /v1/decisions:evaluate`, and returns the typed result. No decision logic, no Dataverse
knowledge.

## Usage

```ts
import { EdpClient } from '@edp/sdk';

const edp = new EdpClient({ baseUrl: 'https://decisions.example.com', apiKey: process.env.EDP_API_KEY });

const result = await edp.evaluate({
  rule: { name: 'Account Credit Tier' },   // or { versionId } / { id }
  input: { revenue: 1_500_000 },
  includeTrace: false,
});

if (result.matched) {
  console.log(result.outputs.creditTier); // "Gold"
  console.log(result.outputs.discount);   // 15
}
```

Errors throw `EdpDecisionError` (with `.code`, `.status`, `.details`):

```ts
import { EdpDecisionError } from '@edp/sdk';
try {
  await edp.evaluate({ rule: { name: 'Missing' } });
} catch (e) {
  if (e instanceof EdpDecisionError && e.code === 'rule_not_found') { /* ... */ }
}
```

## API

- `new EdpClient({ baseUrl, apiKey?, fetch? })` — `fetch` is injectable for tests / non-global-fetch runtimes.
- `evaluate({ rule, input?, includeTrace?, correlationId? }) → Promise<EvaluateResult>`

## Build & test

```bash
npm install
npm test        # vitest (envelope building + error mapping, fetch mocked)
npm run build
```

Sibling SDKs (.NET, Power Platform) are follow-ups; they build the same envelope against the
same gateway.
