---
description: "Revise a specific phase output of an existing engagement"
allowed-tools: Task, Read, Write
---

Revise a phase for an existing engagement: $ARGUMENTS

Format: /revise-phase <project-name> <phase-file> <what to change>
Example: /revise-phase loan-engine phase-3-arch "add event sourcing pattern for audit log"

Steps:
1. Parse: project name, phase file name, and revision instruction from $ARGUMENTS
2. Read the existing file at projects/<project>/<phase-file>.md
3. Identify the correct specialist agent for that phase:
   - phase-1-ceo / phase-7-ceo → ceo
   - phase-2-ba → business-analyst
   - phase-3-arch → architect
   - phase-4-* → relevant build agent
   - phase-5-qa → qa
   - phase-6-audit → auditor
4. Call the agent with: existing phase content + revision instruction as context
5. Overwrite projects/<project>/<phase-file>.md with the revised output
6. Update projects/state.yml last_updated to today's date
7. Confirm: "Phase revised and saved to projects/<project>/<phase-file>.md"
