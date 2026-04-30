import { renameSync, statSync } from 'fs';

const src = 'dist/index.html';
const dst = 'dist/workflow-designer.htm';

renameSync(src, dst);

const bytes = statSync(dst).size;
const kb = (bytes / 1024).toFixed(1);
const mb = (bytes / (1024 * 1024)).toFixed(2);

console.log(`\nBuild output: ${dst}`);
console.log(`Bundle size:  ${kb} KB (${mb} MB)`);

if (bytes > 5 * 1024 * 1024) {
  console.error('ERROR: Bundle exceeds 5MB CRM web resource limit.');
  process.exit(1);
}
if (bytes > 4.5 * 1024 * 1024) {
  console.warn('WARNING: Bundle exceeds 4.5MB — approaching CRM web resource limit.');
}
