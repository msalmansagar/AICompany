import { createSingleFileConfig } from './vite.config';

/**
 * Build entry point for the on-premises designer bundle:
 *   npx vite build --config vite.singlefile.config.ts
 *
 * Emits a single self-contained `index.html` into the same output directory the chunked
 * build uses, so `packageSolution.js` picks it up unchanged. See `createSingleFileConfig`
 * in vite.config.ts for why on-prem cannot use the chunked build.
 */
export default createSingleFileConfig();
