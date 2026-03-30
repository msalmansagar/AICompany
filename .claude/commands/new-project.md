---
description: "Start a new Maqsad AI full engagement (Pattern A pipeline)"
allowed-tools: Task, Read, Write
---

Start a new full engagement for: $ARGUMENTS

1. Add a new entry to projects/state.yml:
   - name: $ARGUMENTS
   - status: in_progress
   - phase: inception
   - started: [today's date]
   - last_updated: [today's date]

2. Create the directory projects/$ARGUMENTS/ if it does not exist.

3. Print the engagement task list immediately:
   ```
   Engagement: $ARGUMENTS
   - [ ] Phase 1: CEO — business objective and success criteria
   - [ ] Phase 2: BA — requirements and user stories
   - [ ] Phase 3: Architect — system design and ADRs
   - [ ] Phase 4: Build — [agents TBD after architect]
   - [ ] Phase 5: QA — test strategy and cases
   - [ ] Phase 6: Audit — governance and security review
   - [ ] Phase 7: CEO — final decision
   ```

4. Ask: "Describe the business problem and I will start Phase 1 with the CEO agent."
