# Customer Survey Engine — Dependency Adoption Decisions

| | |
|---|---|
| Date | 2026-11-09 |
| Basis | Company rule "adopt over build" (CLAUDE.md, Dependency adoption) |
| Decision by | The user (CEO) agreed to record the check here instead of running a full GitHub research phase |
| Why no full research run | The survey screen is reused from the Dynamic Form Engine (`approach-decision.md`). The remaining new parts run mostly inside the Dynamics CRM plugin sandbox, where third-party libraries are impractical, or need nothing beyond the .NET base library. |

## Reused (no new dependency)

| Need | Covered by |
|---|---|
| Survey designer, renderer, translations (Arabic/RTL), versions, publishing, render cache | The existing Dynamic Form Engine (tag `dfe-baseline-2026-11-08`). Its own dependencies are already recorded in `projects/dynamic-form-engine/`. |

## Considered and rejected

| Need | Candidates considered | Decision | Reason |
|---|---|---|---|
| Survey product (content, rendering, responses) | SurveyJS (MIT core; Creator is commercial), Form.io, LimeSurvey | Not adopted | Rejected in the 2026-10-11 assessment and by the hybrid decision. The Form Engine already provides the designer and renderer, in Arabic, inside CRM. A second designer would duplicate it, and SurveyJS Creator needs a commercial licence. |
| Calendar scheduling (monthly / quarterly / annual, postponed release) | Quartz.NET, Hangfire, NCrontab / Cronos | Not adopted | The rules are fixed calendar dates, so a few lines of date logic replace a library. Quartz and Hangfire need a host process and storage, and duplicate the Windows Scheduled Task / Power Automate design (BRD C-2). |
| Secure link tokens (single-use, expiring) | JWT libraries (System.IdentityModel.Tokens.Jwt), Hashids | Not adopted | The design uses an opaque random token from .NET's `RandomNumberGenerator`, stored hashed against the invitation. That is simpler and safer than a self-contained JWT, which cannot be made single-use without server state anyway. To be confirmed by the NFR-CSE-009 security review. |
| Rule / trigger evaluation | json-rules-engine (already used by the Form Engine front end), NRules | Not adopted | Triggers are "status enters a configured set" plus counts. These are simple, data-driven checks, and a rules engine adds no value. The sandbox also blocks most .NET rule engines. |
| SMS / email sending | Twilio and SendGrid SDKs, MailKit | Not adopted | Out of scope. The existing QDB SMS service and the CRM Email Router / server-side sync are used (BRD FR-CSE-048/049). |
| 9.2 → 9.1 on-prem solution down-level (B9 item 3) | SolutionPackager (Microsoft, CLI), Debt Collection's `crm/scripts/lib/onprem-transforms.mjs` (in this repo) | **Adopted: the Debt Collection transforms**, imported by path in `onprem/lib/survey-onprem-transforms.mjs` | They were proven on HL CRM test (import 2, 2026-10-04) and refuse to remove non-default values. SolutionPackager unpacks and repacks but does not down-level. Their Regarding-relationship transform is left out because it is written for Debt Collection's own activity table. A change to that file affects both kits; `onprem/__tests__` checks the survey's list. |

## Plugin sandbox constraint

- **The constraint.** CRM plugins run in the sandbox on .NET Framework 4.6.2 and are deployed as one assembly. Any library would have to be merged into the plugin assembly (ILMerge) and be sandbox-safe: no file system, no reflection-heavy code, outbound HTTP only.
- **Effect.** This rules out most libraries, and the plugin side uses only the .NET base library and the CRM SDK.

## Review trigger

Re-run a GitHub search if the architecture introduces a component outside CRM (a host process, a gateway or a reporting layer). The constraints above do not apply there.
