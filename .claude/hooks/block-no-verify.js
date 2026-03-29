#!/usr/bin/env node
// PreToolUse hook — Bash
// Blocks any git command that uses --no-verify.
// Fix the underlying hook failure instead of bypassing it.

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const command = (input?.tool_input?.command || '').toLowerCase();

    if (command.includes('--no-verify')) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: 'BLOCKED: --no-verify bypasses pre-commit hooks. Investigate and fix the hook failure instead.'
      }));
      process.exit(2);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
