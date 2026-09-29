# Rollback evidence: Rule Engine 1.1.0 cloud deployment (org5869857f, 2026-09-29)

| File | Use in a rollback |
|---|---|
| `registration-snapshot-before.json` | `node deploy/a7-repoint.mjs --rollback <this file> [--apply]` re-binds every Custom API and step to where it was before the re-point |
| `registration-changelog.jsonl` | exactly which 29 items moved, with the before/after plug-in type |
| `rules-before.json`, `rule-versions-before.json` | the 14 rules and 14 versions before deployment (no RuleKeys); proves no rule changed |
| `pre-deployment-inventory.json` | package, assemblies, keys, designer web-resource hashes and EDP roles before deployment |
| `binary-artifacts-manifest.json` | SHA-256 of the artifacts kept **outside git**: the previous package content (`c0fddf94…`, re-uploadable with `deploy/a7-package.mjs`) and the 72 previous designer web resources |

The binary artifacts live in `D:/AI Projects/release-backups/edp-rule-engine/1.1.0-cloud-2026-09-29/` (local, outside any repository). Copy that folder to a company-controlled share; verify every file against the manifest before using it.

The quickest rollback needs none of the binaries: `node deploy/a7-repoint.mjs --to-legacy --apply` binds everything to the signed 1.0.23 assembly, which stays registered.
