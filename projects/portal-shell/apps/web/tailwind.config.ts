import type { Config } from 'tailwindcss';

/**
 * Tailwind CSS v4 configuration.
 *
 * CRITICAL (ADR-PORT-003): All spacing and positioning must use logical properties.
 * Physical classes (ml-*, mr-*, pl-*, pr-*, left-*, right-*, text-left, text-right,
 * rounded-l-*, rounded-r-*) are FORBIDDEN in this project.
 *
 * Use logical equivalents:
 *   ms-* (margin-inline-start), me-* (margin-inline-end)
 *   ps-* (padding-inline-start), pe-* (padding-inline-end)
 *   start-* (inset-inline-start), end-* (inset-inline-end)
 *   text-start, text-end
 *   rounded-s-*, rounded-e-*
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/widget-registry/src/**/*.{ts,tsx}',
  ],
};

export default config;
