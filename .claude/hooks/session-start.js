#!/usr/bin/env node
// UserPromptSubmit hook
// Reads projects/state.yml and injects active project context into every
// session so agents start with current state awareness instead of cold.

const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const stateFile = join(process.cwd(), 'projects', 'state.yml');

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
