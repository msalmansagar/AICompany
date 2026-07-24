#!/usr/bin/env node
// Stop hook — fires after every Claude response
// Captures session details including active project context
// so cross-session memory is meaningful, not just timestamps.

const { appendFileSync, readFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

// Resolve paths from this hook's own location, never process.cwd(). The hook
// inherits whatever working directory the shell last used, so a `cd` into a
// subdirectory would otherwise scatter stray .claude/sessions/log.md files and
// miss the real projects/state.yml. This file lives at .claude/hooks/, so the
// repository root is two levels up.
const REPO_ROOT = join(__dirname, '..', '..');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const sessionsDir = join(REPO_ROOT, '.claude', 'sessions');

    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    const logFile = join(sessionsDir, 'log.md');
    const timestamp = new Date().toISOString();
    const stopReason = input?.stop_reason || 'unknown';
    const turns = input?.num_turns || 0;

    let projectContext = '';
    const stateFile = join(REPO_ROOT, 'projects', 'state.yml');

    if (existsSync(stateFile)) {
      const state = readFileSync(stateFile, 'utf8');
      const nameMatch = state.match(/- name:\s*(.+)/);
      const phaseMatch = state.match(/phase:\s*(.+)/);
      const agentMatch = state.match(/last_agent:\s*(.+)/);
      const statusMatch = state.match(/status:\s*in_progress/);

      if (nameMatch && statusMatch) {
        projectContext += `\n- Active project: ${nameMatch[1].trim()}`;
        if (phaseMatch) projectContext += `\n- Phase: ${phaseMatch[1].trim()}`;
        if (agentMatch) projectContext += `\n- Last agent: ${agentMatch[1].trim()}`;
      }
    }

    appendFileSync(
      logFile,
      `\n## Session — ${timestamp}\n- Stop reason: ${stopReason}\n- Turns: ${turns}${projectContext}\n`
    );

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
