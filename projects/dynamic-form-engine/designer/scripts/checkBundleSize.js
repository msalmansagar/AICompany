'use strict';

// checkBundleSize.js — verifies the Vite build output does not exceed the 4 MB
// CRM web resource limit. Run via: node scripts/checkBundleSize.js [--dir <path>]
//
// Default scan directory: dist
// WHY: Dynamics CRM has a 5 MB hard cap on individual web resources, and we set
// a tighter 4 MB gate here to leave headroom for future growth.

const fs = require('fs');
const path = require('path');

const LIMIT_BYTES = 4_096_000; // 4 MB in bytes
const TRACKED_EXTENSIONS = new Set(['.js', '.css', '.html']);

function parseArgs() {
  const args = process.argv.slice(2);
  const dirFlagIndex = args.indexOf('--dir');
  if (dirFlagIndex !== -1 && args[dirFlagIndex + 1]) {
    return args[dirFlagIndex + 1];
  }
  return 'deploy/webresources/qdb_/form-designer';
}

function collectFiles(dirPath) {
  const results = [];

  if (!fs.existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile() && TRACKED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }

  return results;
}

function formatBytes(bytes) {
  const mb = bytes / 1_048_576;
  return `${bytes.toLocaleString()} bytes (${mb.toFixed(2)} MB)`;
}

function run() {
  const targetDir = parseArgs();
  const absoluteDir = path.resolve(process.cwd(), targetDir);

  const files = collectFiles(absoluteDir);

  if (files.length === 0) {
    console.error(`No .js, .css, or .html files found in: ${absoluteDir}`);
    process.exit(1);
  }

  let totalBytes = 0;
  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    totalBytes += stat.size;
  }

  const formattedSize = formatBytes(totalBytes);

  if (totalBytes > LIMIT_BYTES) {
    console.error(`✗ Bundle size: ${formattedSize} — EXCEEDS 4 MB limit! Build failed.`);
    process.exit(1);
  }

  console.log(`✓ Bundle size: ${formattedSize} — within 4 MB limit`);
}

run();
