/**
 * Vite emits index.html; a Dataverse web resource needs its own name.
 *
 * Renamed rather than configured because vite-plugin-singlefile inlines into
 * whatever the entry produces, and renaming the entry complicates dev mode for
 * no benefit.
 */

import { renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'webresources');
const built = join(outDir, 'index.html');
const target = join(outDir, 'msst_cms_editor.html');

if (!existsSync(built)) {
  throw new Error(`Expected the build to emit ${built}`);
}

renameSync(built, target);
console.log('editor -> webresources/msst_cms_editor.html');
