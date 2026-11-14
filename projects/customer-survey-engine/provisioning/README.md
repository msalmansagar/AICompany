# SurveyEngine provisioning (B1)

Creates the SurveyEngine solution on a cloud org: 9 `qdb_survey_*` tables, 13 lookups,
4 alternate keys, 3 security roles and the per-org seed rows. Schema is declared once in
`manifest.mjs`; see `phase-3-arch.md` section 4 and the B1 implementation decisions.

## Run

From this folder, with the DFE `.env` (service principal for the target org):

```
node --env-file="<main tree>/projects/dynamic-form-engine/scripts/.env" provision.mjs --seed seed/org5869857f.json
```

That is **plan mode**: it reads the org and lists what it would create. Nothing is written.

```
node --env-file="<main tree>/projects/dynamic-form-engine/scripts/.env" provision.mjs --seed seed/org5869857f.json --apply
```

`--apply` is a **live schema change** and needs the user's explicit go-ahead for that org.
It creates only what is missing, so it is safe to re-run after a partial failure.

## Seed files

One JSON file per org in `seed/`. Field names differ per org, so they are data, not code.
A value of `TO_CONFIRM` makes the provisioner skip that row and say why. Existing rows are
never overwritten, so an admin's later edits survive a re-run.

## Tests

```
node --test __tests__/manifest.test.mjs __tests__/payloads.test.mjs
```

## On-prem

This client uses cloud client-credentials auth only. On-prem orgs receive the SurveyEngine
solution ZIP exported from the cloud org (`phase-3-arch.md` section 13.3); the publisher on
the on-prem org must be the same `qdb` publisher.
