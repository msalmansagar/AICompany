---
description: "Run clean code review on any file or code block"
allowed-tools: Task, Read
---

Run a clean code review on: $ARGUMENTS

Read the file at $ARGUMENTS if it is a file path.
Then spawn the code-reviewer agent and ask it to produce
a full clean code compliance report.

After the review, if violations are found, ask the user:
"Do you want me to apply the fixes automatically?"
