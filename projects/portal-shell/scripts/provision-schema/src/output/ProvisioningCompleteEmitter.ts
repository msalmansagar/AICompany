import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import type { ValidationCheckResult } from '../types/ProvisioningResult.js';

// CHALLENGE 8 resolution: emit PROVISIONING-COMPLETE.md to the script's working directory.
// Lists all validation check results, PAC CLI command, and column security manual step.

export async function emitProvisioningCompleteFile(
  validationResults: readonly ValidationCheckResult[],
  isDryRun: boolean,
): Promise<void> {
  const outputPath = join(process.cwd(), 'PROVISIONING-COMPLETE.md');
  const content = buildMarkdownContent(validationResults, isDryRun);

  await writeFile(outputPath, content, 'utf-8');
  console.log(`[PHASE-11] PROVISIONING-COMPLETE.md written to: ${outputPath}`);
}

function buildMarkdownContent(
  results: readonly ValidationCheckResult[],
  isDryRun: boolean,
): string {
  const timestamp = new Date().toISOString();
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  const checkRows = results
    .map((r) => `| ${r.passed ? 'PASS' : 'FAIL'} | ${r.checkName} | ${r.detail} |`)
    .join('\n');

  const dryRunNote = isDryRun
    ? '\n> **DRY_RUN=true** — This run did not create any Dataverse objects.\n'
    : '';

  return `# QDB Portal Shell — Provisioning Complete
${dryRunNote}
**Date:** ${timestamp}
**Validation:** ${passed}/${total} checks passed

## Validation Check Results

| Status | Check | Detail |
|--------|-------|--------|
${checkRows}

## PAC CLI Solution Export (C-SCHEMA-008)

Run the following command after reviewing the validation output:

\`\`\`bash
pac auth create --url ${env.DATAVERSE_ORG_URL}

pac solution export \\
  --name QdbPortalShell \\
  --path ./QdbPortalShell_1_0_0_0_managed.zip \\
  --managed \\
  --overwrite
\`\`\`

The managed solution file must be committed to version control and delivered to the client
as the deployable artefact. Do not deliver the unmanaged version.

## Column Security Profile — Manual Step Required (CHALLENGE 6)

The \`qdb_auth_config_json\` column on \`qdb_portal_configs\` stores auth provider credentials
(clientId, clientSecret). Without a Column Security Profile, any user with Read access to
the portal config entity can read these values.

**Steps:**
1. Open Power Apps maker portal: https://make.powerapps.com
2. Navigate to: Settings > Column Security Profiles
3. Create a new profile named **"Portal Auth Config"**
4. Set permissions: Read = No, Update = No for all non-admin roles
5. Assign the profile to the \`qdb_auth_config_json\` column on \`qdb_portal_configs\`

## Smoke Test User Deactivation Reminder (C-SCHEMA-005)

The test user \`smoketest@portalshell.internal\` was seeded for staging smoke tests.

**Before promoting to production:**
- Deactivate the record (set statecode = 1) via Power Apps, OR
- Delete the record entirely

Failure to deactivate this user is a security risk in production.
`;
}
