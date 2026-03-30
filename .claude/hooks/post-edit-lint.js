#!/usr/bin/env node
// PostToolUse hook — Edit | Write
// Runs ESLint on edited .ts/.tsx/.js/.jsx files to surface lint errors
// immediately after every edit. Skips if no ESLint config exists in cwd.

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');
const chunks = [];

process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = input?.tool_input?.file_path || '';

    if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) {
      process.exit(0);
    }

    const cwd = process.cwd();
    const hasEslintConfig =
      existsSync(join(cwd, '.eslintrc')) ||
      existsSync(join(cwd, '.eslintrc.js')) ||
      existsSync(join(cwd, '.eslintrc.cjs')) ||
      existsSync(join(cwd, '.eslintrc.json')) ||
      existsSync(join(cwd, '.eslintrc.yml')) ||
      existsSync(join(cwd, 'eslint.config.js')) ||
      existsSync(join(cwd, 'eslint.config.mjs')) ||
      existsSync(join(cwd, 'eslint.config.cjs'));

    if (!hasEslintConfig) {
      process.exit(0);
    }

    try {
      execSync(`npx eslint --max-warnings=0 "${filePath}"`, { stdio: 'pipe' });
    } catch (e) {
      const output = e.stdout?.toString() || e.stderr?.toString() || '';
      if (output.trim()) {
        console.log(`ESLint issues in ${filePath}:\n${output}`);
      }
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
