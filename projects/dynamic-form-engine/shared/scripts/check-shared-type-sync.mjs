// check-shared-type-sync.mjs — DFE-BTN-001 condition C-006.
//
// Fails the build if the DFE-BTN-001 button/param types drift between the two
// shared type files:
//   shared/src/types/form.types.ts  (backend + frontend)
//   shared/src/types/form.ts        (mobile)
//
// These two files historically diverge on PRE-EXISTING types (id vs tabId,
// label vs displayLabel) and that is intentional — this check ONLY governs the
// new DFE-BTN-001 types listed in SYNCED_TYPES, which MUST be identical so all
// four runtimes consume one contract. Dependency-free: uses fs + string parsing
// only (no ts-morph), so it runs in any CI without extra install.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_FILE = resolve(HERE, '../src/types/form.types.ts');
const MOBILE_FILE = resolve(HERE, '../src/types/form.ts');

// The DFE-BTN-001 types that must be byte-for-byte equivalent across both files.
const SYNCED_TYPES = [
  'ButtonPlacementScope',
  'ScopedButtonActionType',
  'NavigationTargetType',
  'UnsavedDataPolicy',
  'NavigateActionConfig',
  'ExtraParamSource',
  'RuntimeContextKey',
  'ExtraParamSpec',
  'FinalSubmitActionConfig',
  'SaveDraftActionConfig',
  'CallApiRequestFieldRef',
  'CallApiResponseMapping',
  'CallApiActionConfig',
  'ScopedButtonAction',
  'ScopedButton',
  'ResolvedExtraParams',
];

/** Strip line and block comments so member extraction ignores documentation. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Extract the normalised declaration body for a named type/interface. */
function extractDeclaration(source, name) {
  const clean = stripComments(source);

  const iface = clean.match(new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (iface) {
    const members = iface[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/;$/, '').replace(/\s+/g, ' '))
      .sort();
    return `interface{${members.join('|')}}`;
  }

  const alias = clean.match(new RegExp(`export type ${name}\\s*=([\\s\\S]*?);`));
  if (alias) {
    const parts = alias[1]
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .sort();
    return `type{${parts.join('|')}}`;
  }

  return null;
}

function loadFile(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`check-shared-type-sync: cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
}

const webSource = loadFile(WEB_FILE);
const mobileSource = loadFile(MOBILE_FILE);

const problems = [];

for (const typeName of SYNCED_TYPES) {
  const web = extractDeclaration(webSource, typeName);
  const mobile = extractDeclaration(mobileSource, typeName);

  if (!web) problems.push(`MISSING in form.types.ts: ${typeName}`);
  if (!mobile) problems.push(`MISSING in form.ts (mobile): ${typeName}`);
  if (web && mobile && web !== mobile) {
    problems.push(
      `DRIFT in ${typeName}:\n    form.types.ts -> ${web}\n    form.ts       -> ${mobile}`,
    );
  }
}

if (problems.length > 0) {
  console.error('✖ Shared-type parity check FAILED (DFE-BTN-001 / C-006):\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\n  The DFE-BTN-001 button/param types must be identical in both shared type files.',
  );
  process.exit(1);
}

console.log(`✔ Shared-type parity OK — ${SYNCED_TYPES.length} DFE-BTN-001 types match across both files.`);
