# CMS-ENG-001 — message contracts

**The signature every caller must match.** Provisioned on `org5869857f` as Custom
APIs on 2026-08-11 and verified against the org.

Per architecture §7 these same three names are declared as **Custom Process
Actions on-premise**, with identical parameters. A caller does not know which
platform it is on, and must not need to.

---

## Why this document exists

The Dynamic Form Engine has a live defect of exactly this shape: its publish
client sends **five** parameters to `qdb_PublishForm`, and the API declares
**three**. A raw REST call with that payload returns 400; the declared-only
payload returns 204. It was never caught because nothing wrote the contract
down where both sides could read it.

**This file is the contract.** A change here is a change to every caller.

---

## `msst_CmsPublishPage`

Validates, compresses and publishes a page version, writing the render cache and
the audit row in the same operation (§3, §5).

| Direction | Name | Type | |
|---|---|---|---|
| Request | `PageId` | Guid | required |
| Request | `Comment` | String | optional |
| Response | `PublishedVersionNumber` | Integer | |
| Response | `Message` | String | |

**Rejects** — payload containing a `data:` URI · payload over 90 % of the Memo
limit, reporting the measured size · props failing the component schema ·
unresolvable asset key or token slug · a version with no approval for the route
its classification currently selects · an approver equal to the version's author.

---

## `msst_CmsGetPublishedPageJson`

Reads the render cache, decodes, decompresses, returns plain JSON. **Never
generates.**

| Direction | Name | Type | |
|---|---|---|---|
| Request | `Slug` | String | required |
| Request | `LanguageCode` | String | required |
| Response | `PageJson` | String | |

**Used by the editor, not by visitors.** Per §7, the portal reads the render-cache
row directly and decompresses in Node — that is what keeps a Custom Action's
workflow overhead off the on-premise hot path and NFR-01 intact.

---

## `msst_CmsUploadIcon`

Parses an SVG, extracts allowlisted geometry, rejects anything with no drawable
content remaining, and reports what was stripped (FR-23, FR-24).

| Direction | Name | Type | |
|---|---|---|---|
| Request | `IconKey` | String | required |
| Request | `SvgContent` | String | required |
| Response | `Geometry` | String | |
| Response | `StrippedElements` | StringArray | |

`StrippedElements` is FR-24 — *"record what was stripped from an upload, and log
rejections rather than discarding them silently."* A sanitiser that reports
nothing cannot be audited.

---

## Settings, and why

| Setting | Value | Reason |
|---|---|---|
| `BindingType` | Global | None of the three is an operation *on* a record |
| `IsFunction` | false | All three mutate or are POST-shaped; the DFE precedent is the same |
| `AllowedCustomProcessingStepType` | **None** | §3's argument for routing publish through a plugin collapses if anyone can bolt a step onto it |
| `IsPrivate` | false | Callers are our own editor and portal, but not inside the plugin boundary |
| `PluginTypeId` | **not set yet** | Bound when the assembly is registered — the assembly does not exist |

---

## Verified state

```
msst_CmsPublishPage           request(2): PageId, Comment?   response(2): PublishedVersionNumber, Message
msst_CmsGetPublishedPageJson  request(2): Slug, LanguageCode response(1): PageJson
msst_CmsUploadIcon            request(2): IconKey, SvgContent response(2): Geometry, StrippedElements

MssCmsEngine components: 10 entities, 3 custom APIs, 6 request parameters, 5 response properties
```

Reproduce with `scripts/provision-cms-messages.mjs` (idempotent).

---

## Open, and deliberately not guessed

**§3 marks `msst_CmsPublishPage` as async, PostOperation stage 40.** A Custom
API's main operation plugin runs synchronously; async is a property of a
registered *step*, not of the message. The contract above is
transport-neutral, so it holds either way, but **whether publish returns after
writing the cache or queues that work is a Phase 4 decision that §3's table does
not settle.** `PublishedVersionNumber` in the response implies synchronous, and
that tension should be resolved deliberately rather than by whoever writes the
plugin first.
