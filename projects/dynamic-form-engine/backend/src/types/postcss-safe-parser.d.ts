// Minimal type declaration for postcss-safe-parser@6.
// The library ships no .d.ts files and there is no @types package.
// This declaration matches the single-function API we use.
declare module 'postcss-safe-parser' {
  import type { Parser, Document, Root } from 'postcss';
  const safeParser: Parser<Root | Document>;
  export default safeParser;
}
