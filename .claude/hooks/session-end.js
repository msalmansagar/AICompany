#!/usr/bin/env node
// Stop hook — fires after every Claude response
// Appends a session entry to .claude/sessions/log.md
// so engagement history persists across sessions.

const { appendFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const sessionsDir = join(process.cwd(), '.claude', 'sessions');

    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    const logFile = join(sessionsDir, 'log.md');
    const timestamp = new Date().toISOString();
    const stopReason = input?.stop_reason || 'unknown';
    const turns = input?.num_turns || 0;

    appendFileSync(
      logFile,
      `\n## Session — ${timestamp}\n- Stop reason: ${stopReason}\n- Turns: ${turns}\n`
    );

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
