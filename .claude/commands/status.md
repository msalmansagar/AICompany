---
description: "Show current engagement status across all active projects"
allowed-tools: Read
---

Read projects/state.yml and summarize all engagements.

For each project in state.yml, read the latest phase file and produce:

**Project Status Board**

| Project | Type | Phase | Status | Last Agent | Last Updated |
|---------|------|-------|--------|------------|--------------|

For every `in_progress` project also show:
- **Current phase**: what is active
- **Last output summary**: one paragraph from the latest phase file
- **Next step**: what needs to happen to advance to the next phase
- **Blockers**: any open questions or pending CEO approvals

If no projects are active, say: "No active engagements. Use /new-project <name> to start one."
