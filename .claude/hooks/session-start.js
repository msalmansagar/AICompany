#!/usr/bin/env node
// UserPromptSubmit hook
// Reads projects/state.yml and injects active project context into every
// session so agents start with current state awareness instead of cold.

const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

// Resolve state.yml from this hook's own location, never process.cwd(). The
// hook inherits whatever working directory the shell last used, so a `cd` into
// a subdirectory would otherwise miss the real projects/state.yml and silently
// stop injecting project context. This file lives at .claude/hooks/, so the
// repository root is two levels up.
const REPO_ROOT = join(__dirname, '..', '..');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const stateFile = join(REPO_ROOT, 'projects', 'state.yml');

    if (!existsSync(stateFile)) {
      process.exit(0);
    }

    const stateContent = readFileSync(stateFile, 'utf8');

    if (!stateContent.includes('in_progress')) {
      process.exit(0);
    }

    const context =
      `[PROJECT STATE — read before responding]\n${stateContent}\n` +
      `Active projects exist above. Check if this message relates to one ` +
      `and load the relevant phase file before responding.`;

    console.log(JSON.stringify({ additionalContext: context }));
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
