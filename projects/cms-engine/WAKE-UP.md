# CMS Engine — what to look at first

**Built 2026-08-11, overnight session.** Everything below is live on
`org5869857f` and verified by running it, not by reasoning about it.

---

## See a page, in about thirty seconds

1. Open:
   `https://org5869857f.crm4.dynamics.com/main.aspx?pagetype=webresource&webresourceName=msst_cms_viewer.html`
2. Type the slug **`about-reyada`**
3. Press **Load**, and switch the language selector to **العربية**

You should see a hero, two rich-text blocks with a bullet list, and the whole
thing flipping to right-to-left in Arabic. Expand *"Raw JSON"* to see exactly
what came out of the render cache.

> ⚠️ It must be opened through `main.aspx?pagetype=webresource`, **not** the raw
> `/WebResources/` URL — there is no `Xrm` on that path, so nothing loads.

**What you are looking at is real**: the content was compressed, stored in a Memo
column, published through a plugin that wrote an audit row in the same
operation, and read back out through a Custom API.

---

## What honestly exists

| | |
|---|---|
| Schema | ✅ 10 entities, 33 columns, 4 relationships |
| Message contracts | ✅ 3 Custom APIs, 11 parameters |
| Plugin assembly | ✅ Built, signed, registered, bound to 2 of 3 messages |
| Publish pipeline | ✅ End-to-end, 8 checks passing |
| **Authoring UI** | ❌ **Does not exist** |

**You cannot yet create a page by clicking.** Pages are created by running
`scripts/seed-demo-page.mjs`. The Puck-based editor is a bundler, a component
library and a web-resource build — a real piece of work, not an evening's.

The viewer is a **smoke test, not the product renderer**. It handles two block
types in plain JavaScript. ADR-CMS-004's renderer is React and shares a block
library with the editor; this one exists so the pipeline could be seen working.

---

## What the end-to-end test proves

`scripts/e2e-publish-a-page.mjs` — all 8 pass:

```
publish returns the version number
round-trips byte-identical
Arabic survives the round trip
rich text markup survives
an audit row was written by the plugin
a data: URI is rejected
a page with no versions is rejected
an unpublished page is not served
```

The last three matter most. **A gate never seen failing is not known to be a
gate**, so the test drives the rejections deliberately rather than only the
happy path.

---

## Three things that went wrong, and what they cost

**1 — The schema had no relationships.** The first provisioning pass created
entities and columns and looked complete. It was not: nothing linked a version
to its page. Found only when the publish plugin needed `msst_pageid` to query.
Fixed by `provision-cms-relationships.mjs`.

**2 — A Custom API parameter's `UniqueName` is what callers pass, not its
`Name`.** They were provisioned as `msst_CmsPublishPage.PageId`, so the first
call failed with *"the parameter 'PageId' is not a valid parameter"*.

This is **exactly the defect class `message-contracts.md` was written about**
hours earlier — the DFE sends five parameters to an API that declares three. The
document did not prevent it. What caught it was calling the API.

**3 — A test assertion compared the wrong field** — the hero's Arabic heading
against the page title — and reported a failure that did not exist. Comparing
against the source object rather than a re-typed literal fixed it.

---

## Dataverse behaviours worth not rediscovering

- **`ECONNRESET` on create usually still creates the thing.** Re-check existence
  before treating it as failure. This caught out entity creation, the plugin
  assembly upload, and a relationship.
- **`0x80040216` "An unexpected error occurred"** means the parent entity has not
  settled, not that your definition is wrong. Retry.
- **A retry can collide with its own successful first attempt** —
  `msst_cmspageversion_cmsapproval` failed as *"not unique"* because the create
  it was retrying had actually worked.
- **Publishing is exclusive.** A second `PublishAllXml` while one is running
  returns 429.

---

## Where to pick up

1. **The authoring UI** — the largest remaining piece of Phase A.
2. **`msst_CmsUploadIcon` has no plugin yet.** The message exists; the geometry
   extractor does not. It is Delivery Phase C and the gate has not approved it.
3. **Approval enforcement is not in the publish plugin yet.** §5 requires that a
   publish be refused without an approval for the page's classification route.
   The schema is there; the check is not. **Today a publish succeeds without
   approval**, which is a Phase A Must requirement (FR-60) still open.
4. **G-1 media storage** still blocks `msst_cmsmediaasset`'s binary column.

---

## Not pushed

Everything is committed on `feat/cms-gate-and-provisioning`, **local only** — the
push was blocked by a permission rule. Nothing is on GitHub. The org changes are
live regardless; the branch is the paper trail.
