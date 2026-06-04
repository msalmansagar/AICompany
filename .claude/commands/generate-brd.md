---
description: "Compile BA phase output into a formal Business Requirements Document"
allowed-tools: Task, Read, Write
---

Generate a formal BRD for project: $ARGUMENTS

1. Read projects/$ARGUMENTS/phase-1-ceo.md (for business objectives)
2. Read projects/$ARGUMENTS/phase-2-ba.md (for requirements)

3. Compile into projects/$ARGUMENTS/brd.md with this structure:

---
# Business Requirements Document
## $ARGUMENTS

**Version**: 1.0
**Date**: [today]
**Status**: Draft
**Prepared by**: Maqsad AI — Business Analyst

---

### Document Control
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [today] | BA Agent | Initial draft |

### Stakeholder Sign-Off
| Name | Role | Signature | Date |
|------|------|-----------|------|
| | | | |

### Executive Summary
(from CEO phase 1 — business objective)

### Business Objectives and Success Criteria
(from phase 1)

### Actors and Roles
(from phase 2)

### User Stories
(all US-XX from phase 2, with acceptance criteria)

### Functional Requirements
(all FR-XXX from phase 2)

### Non-Functional Requirements
(NFRs from phase 2)

### Integration Points
(from phase 2)

### Data Requirements
(from phase 2)

### Out of Scope
(from phase 2)

### Requirements Traceability Matrix
| User Story | Functional Req | Test Case | Status |
|------------|----------------|-----------|--------|
(populated from phase 2 traceability matrix)

### Open Questions and Assumptions
(from phase 2)

---

4. Confirm: "BRD saved to projects/$ARGUMENTS/brd.md"
