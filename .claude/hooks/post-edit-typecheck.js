#!/usr/bin/env node
// PostToolUse hook — Edit | Write
// After editing a .ts or .tsx file, runs tsc --noEmit to catch
// type errors immediately rather than at build time.
// Skips if no tsconfig.json exists in cwd.

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = input?.tool_input?.file_path || '';

    // Only act on TypeScript files
    if (!filePath.match(/\.(ts|tsx)$/) || filePath.endsWith('.d.ts')) {
      process.exit(0);
    }

    // Only act if a tsconfig exists
    if (!existsSync(join(process.cwd(), 'tsconfig.json'))) {
      process.exit(0);
    }

    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
    } catch (e) {
      const output = e.stdout?.toString() || e.stderr?.toString() || '';
      console.log(`TypeScript errors detected after editing ${filePath}:\n${output}`);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
