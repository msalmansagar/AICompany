# Bundling proof — can the editor ship into a CSP-hardened on-premise CRM?

This answers **D-4** in `projects/cms-engine/adrs/index.md` and supplies the
measurements behind **A-3** in `projects/cms-engine/phase-3-arch.md`.

A hardened Dynamics CRM blocks CDN loads by Content Security Policy, so a web
resource must be entirely self-contained: one file, no network requests, no
`eval`. Whether Puck can do that was the risk most likely to invalidate the
whole approach, so it was tested rather than assumed.

## Reproduce

```bash
npm i -D esbuild

# Editor bundle — React + Puck + block library
node_modules/.bin/esbuild bundle-test/entry.tsx \
  --bundle --minify --format=iife --platform=browser --target=es2020 \
  --jsx=automatic --define:process.env.NODE_ENV='"production"' \
  --outfile=bundle-test/out.js

# Visitor bundle — React + our renderer, no Puck (ADR-CMS-004)
node_modules/.bin/esbuild bundle-test/runtime.tsx \
  --bundle --minify --format=iife --platform=browser --target=es2020 \
  --jsx=automatic --define:process.env.NODE_ENV='"production"' \
  --outfile=bundle-test/runtime.js
```

## Result

| Bundle | Raw | Gzipped |
|---|---|---|
| Editor (with Puck) | 1.07 MB | **331 KB** |
| Visitor (our renderer) | 0.17 MB | **53 KB** |

The visitor bundle is **84 % smaller gzipped**, which is the measured value of
ADR-CMS-004 — and Puck is absent from the citizen-facing path entirely.

## Self-containment scan of the editor bundle

| Check | Result |
|---|---|
| Dynamic `import()` | 0 |
| `fetch()` | 0 |
| `importScripts` | 0 |
| `eval()` / `new Function()` | 0 |
| Node-only APIs | none |
| Absolute URLs | 12 — all XML namespace identifiers (`w3.org/2000/svg`, xlink, MathML) plus one React error-doc link. Identifiers, not fetched resources. |

**Verdict: Puck bundles cleanly for an on-premise CSP-hardened web resource.**

## What this does not prove

The scan is static. It shows the bundle *contains* no network calls or CSP
hazards — it does not prove the editor behaves correctly once loaded as a
Dynamics web resource under a real CSP header. That needs a live org and belongs
to the build phase, not to architecture.
