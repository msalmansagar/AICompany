#!/usr/bin/env node
// Stop hook — fires after every Claude response
// Captures session details including active project context
// so cross-session memory is meaningful, not just timestamps.

const { appendFileSync, readFileSync, mkdirSync, existsSync } = require('fs');
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

    let projectContext = '';
    const stateFile = join(process.cwd(), 'projects', 'state.yml');

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
