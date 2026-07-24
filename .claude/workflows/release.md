# Workflow — Release

Shipping approved work into an environment: staging, a client org, or
production.

**Entry gate:** CEO ship decision.
**Output:** a release record appended to the parent engagement's documents.

---

## Steps

1. **Blocker check** — read `projects/state.yml`. Every numbered blocker
   gating this milestone is either closed with evidence, or the release does
   not proceed. An open blocker is not a risk to accept in passing; it is a
   stop.
2. **Environment confirmation** — name the target org, solution, and publisher
   prefix explicitly. State whether it is cloud or on-premise; the deployment
   mechanism differs and so do the constraints.
3. **Pre-flight** — typecheck, tests, and build clean from a clean tree.
   Confirm no secret is present in anything being shipped.
4. **User go-ahead** — explicit, for this deployment, to this environment.
   Never inferred from a prior approval to a different environment.
5. **Deploy** — per the project's documented mechanism.
6. **Verify in the target** — `VERIFICATION` block against the deployed
   environment, not the local one.
7. **Record** — what shipped, where, when, and the verification evidence.
   Update `projects/state.yml`.

---

## CRM deployment checklist

Applies to any release touching Dynamics or Dataverse. Every item below cost
a failed deployment at least once.

- [ ] Solution manifest generated from the actual build output, not hand-maintained
- [ ] Every web resource declared individually in `RootComponents`, with both
      `id` and `schemaName`, `id` matching `WebResourceId`
- [ ] `<FileName>` entries start with `/`
- [ ] `[Content_Types].xml` present at ZIP root
- [ ] Plugin assembly is the **merged, signed** `dist` output, targeting 4.7.1
- [ ] `MSCRM.SolutionUniqueName` header on metadata creates — nothing lands in
      the Default Solution
- [ ] No query strings on web-resource asset URLs (on-prem returns 500)
- [ ] Publish customizations after form, view, or sitemap changes
- [ ] After deploying a plugin: wait 30–60s and re-run once before verifying
- [ ] After republishing a bundle: hard refresh before verifying
- [ ] No hardcoded record GUIDs — they differ per org

Full detail for each: `.claude/memory/company-knowledge.json`.

## Rollback

State the rollback mechanism **before** deploying, not after a failure.
For CRM: the previous solution version, or the previous assembly content for
a raw assembly PATCH. If there is no rollback path, say so explicitly and get
the user's go-ahead with that fact stated.

## Production

Production releases on QDB engagements additionally require data residency
and PDPPL sign-off to be closed, not merely acknowledged. These are human
gates held by client stakeholders and cannot be closed by any agent.
