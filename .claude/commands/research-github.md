---
description: "Search GitHub for existing repos before implementing a feature"
allowed-tools: Task, WebSearch, WebFetch
---

Research GitHub for existing solutions before implementing: $ARGUMENTS

Spawn the github-researcher agent with the following context:
- Feature to implement: $ARGUMENTS
- Technology stack: infer from the active project in projects/state.yml,
  defaulting to Node.js + TypeScript or C# + .NET as appropriate
- Constraints: no mandatory cloud dependency, MIT or Apache license preferred

After the research report is produced, present the verdict
and recommendation to the user before any code is written.
