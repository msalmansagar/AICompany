// Barrel re-export — all CRM attribute name registries.
// This file intentionally contains no definitions — only re-exports.
// Split from monolith as part of SC-09 (NFR-014 line-cap compliance).
//
// Import from the domain file directly for tree-shaking,
// or import from this barrel when multiple domains are needed.

export * from './formAttributeNames';
export * from './ruleAttributeNames';
export * from './i18nAttributeNames';
export * from './publishAttributeNames';
export * from './gridAttributeNames';
export * from './designAttributeNames';
export * from './styleAttributeNames';
