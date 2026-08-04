# CWFD-005 — DP-2 / DP-2b Reconciliation (escalation)

Engagement: CWFD-005 / RT-1
Date:       2026-07-27
Status:     **Code complete. Eleven org columns pending a deletion decision.**

---

## 1. A correction, first

The discovery pass claimed a four-level TAT engine had been *enforcing deadlines since
May*. That was inferred from column names and it does not hold up. Verified since:

| Claim | Reality |
|---|---|
| A four-level TAT stack enforces deadlines | **No.** `qdb_agreedtat`, `qdb_tasktat`, `qdb_tat_days`, `qdb_tat_level2_days`, `qdb_tat_level3_days`, `qdb_tatlevel4days`, `qdb_exclude_tat`, `qdb_reminder`, `qdb_escalationtimeformat` are read by none of the three assemblies and none of the org's **1,621 workflows** |
| DP-2 duplicated live capability | **Yes, but the mechanism is different.** The engine reads exactly two step columns: `qdb_escalation` and `qdb_applyescalationfilter` |
| That capability is running today | **No.** There are **zero** escalation configuration records. The machinery is wired and dormant |

The duplication finding survives; the description of what was duplicated does not. The TAT
columns are unexplained — legacy, or read by something outside these assemblies. The
designer deliberately does **not** surface them: surfacing unread columns is the exact
mistake this work exists to correct.

---

## 2. The engine's escalation model

`QDBCatalog.CRM.TatAndEscalations.CreateEscalationRecord`:

```csharp
var step = service.Retrieve(..., new ColumnSet("qdb_escalation", "qdb_applyescalationfilter"));
config = step.qdb_escalation != null
       ? step.qdb_escalation                                    // a named policy
       : (step.qdb_applyescalationfilter
            ? GetActualEscalationConfig(step, target, ...)       // resolved by condition
            : null);                                            // does not escalate
```

`qdb_escalation` points at **`qdb_escalationconiguration`** — the platform's spelling, not
a typo of mine — which carries the escalation value and unit, working-hours versus
working-days versus calendar-days, level, next-level chain, frequency, stop-after, email
template, and a workflow to trigger.

**The policy is shared.** A step names one; every step naming it escalates identically.
DP-2 flattened that shared record into eleven copies-per-step, which is why it felt wrong
independently of being unread.

| | DP-2 (retired) | Reconciled |
|---|---|---|
| Deadline | `qdb_sla_duration` + `qdb_sla_duration_unit` per step | on the shared policy |
| Basis | `qdb_sla_basis` per step | on the shared policy |
| Warning | `qdb_sla_warning_pct` per step | policy frequency / next-level chain |
| Action | `qdb_escalation_action` per step | policy email template / trigger workflow |
| Target | three lookups per step | policy recipients |
| Selection | — | `qdb_escalation`, or `qdb_applyescalationfilter` to resolve by condition |
| Read by the engine | **nothing** | `CreateEscalationRecord` |

---

## 3. What changed

**Removed:** `SlaFields` and its four global option sets, `slaStepFields.ts`,
`slaValidator.ts`, `SlaEscalationSection`, the `INVALID_SLA` violation, the SOP-side
`VS-07` publish gate, four provisioning scripts, and `sopValidator.test.ts` — whose only
subject was `VS-07`, leaving it nothing to assert.

**Added:** `escalationFields.ts` (mapping for both adapters; the policy lookup binds and
clears through its navigation property), `getEscalationConfigs()` on `ICrmAdapter` and both
adapters, and `EscalationSection` — a policy picker that **names** the policy rather than
restating its numbers, because the numbers belong to the shared record.

The picker states plainly when no policies exist rather than showing an empty dropdown,
which is the current state of this org.

**Net −1,122 lines.** With the DP-1 half, the reconciliation removed roughly **1,800 lines**
more than it added.

---

## 4. Verification

tsc clean · **121 tests** · production build green · bundle 1772.3 → **1763.8 KB**.

No live E2E was run for this half, and that is a deliberate limit rather than an oversight:
with zero escalation configurations on the org there is nothing to point a step at, so a
round-trip would only prove that a null lookup stays null. The DP-1 half was verified live
because there was something real to verify against.

---

## 5. Still open

- **Eleven columns remain on the org** — `qdb_sla_enabled`, `qdb_sla_duration`,
  `qdb_sla_duration_unit`, `qdb_sla_basis`, `qdb_sla_warning_pct`,
  `qdb_escalation_enabled`, `qdb_escalation_action`, `qdb_escalation_target_type`,
  `qdb_escalationuser`, `qdb_escalationteam`, `qdb_escalationrole` — plus the same set on
  `qdb_sopstep`, four global option sets, and three one-to-many relationships. All now
  referenced by nothing. Deleting is irreversible and needs an explicit decision.
- **The TAT columns need an owner's explanation.** Nine columns describing deadlines that
  nothing reads is either dead schema or a mechanism living somewhere we have not looked.
  Worth one question to the platform team.
- **No escalation policies exist.** Until someone authors one, the picker is empty and no
  step can escalate. That is a data gap, not a code gap.
