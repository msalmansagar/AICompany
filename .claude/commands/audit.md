---
description: "Run a full governance and security audit on a file or document"
allowed-tools: Task, Read
---

Run a complete governance and security audit on: $ARGUMENTS

1. Read the file or content at $ARGUMENTS.

2. Spawn the auditor agent with the full content as context.

3. Request a complete Phase 6 audit report covering:
   - All 7 code audit passes (Wiring, Error Handling, Completeness,
     Dead Code, Bloat, Hardcoding, Security)
   - Security Risk Register (SEC-XX format)
   - OWASP Top 10 assessment
   - Compliance assessment (applicable frameworks)
   - Governance gaps ranked by severity
   - Go-Live Clearance decision

4. After the report, ask: "Do you want me to apply any of the CRITICAL fixes automatically?"
