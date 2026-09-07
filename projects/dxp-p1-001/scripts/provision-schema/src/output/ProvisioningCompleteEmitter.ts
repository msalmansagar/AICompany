import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import type { ValidationCheckResult } from '../types/ProvisioningResult.js';

export async function emitProvisioningCompleteFile(
  validationResults: readonly ValidationCheckResult[],
  isDryRun: boolean,
): Promise<void> {
  const outputPath = join(process.cwd(), 'PROVISIONING-COMPLETE.md');
  const content = buildMarkdownContent(validationResults, isDryRun);
  await writeFile(outputPath, content, 'utf-8');
  console.log(`[PHASE-10] PROVISIONING-COMPLETE.md written to: ${outputPath}`);
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

  return `# QdbDxpPlatform — Provisioning Complete
${dryRunNote}
**Date:** ${timestamp}
**Validation:** ${passed}/${total} checks passed

## Validation Check Results

| Status | Check | Detail |
|--------|-------|--------|
${checkRows}

## PAC CLI Solution Export

Run the following command after reviewing the validation output:

\`\`\`bash
pac auth create --url ${env.DATAVERSE_ORG_URL}

pac solution export \\
  --name QdbDxpPlatform \\
  --path ./QdbDxpPlatform_1_0_0_0_managed.zip \\
  --managed \\
  --overwrite
\`\`\`

## Post-Provisioning Notes

- The alternate key on \`qdb_component_definitions.qdb_name\` enables OData alternate-key addressing.
- All 5 seed component definitions are seeded idempotently.
- No Dataverse plugins are deployed — immutability is enforced at the Fastify API layer.
- Future DXP engagements (P1-002/003/004) add entities to this same solution.
`;
}
