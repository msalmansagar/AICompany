/**
 * Volatile stamp field names: present in the render-cache runtime JSON but carry
 * per-publish timestamps or generator metadata rather than form content.
 * Stripping them before a deep-compare prevents false positives when the content
 * is structurally unchanged but the publish timestamp has advanced.
 *
 * The list is explicit, not a heuristic pattern-match, so that future additions
 * to the generator are intentionally enrolled here rather than silently suppressed.
 *
 * To extend it at the CLI, pass --strip-extra-stamps <comma-separated keys>.
 * To extend it programmatically, pass extraStamps to normalise().
 *
 * @module regression-gate/lib/volatile-stamps
 */

/** @type {readonly string[]} */
export const DEFAULT_VOLATILE_STAMPS = Object.freeze([
  // The keys the C# publisher actually emits (FormDefinitionModel.cs). Re-publishing
  // bumps `version`, and `modifiedAt` moves with any definition save. Neither key is
  // used below the form root, so stripping them at every depth hides no content.
  'version',
  'modifiedAt',

  // Defensive aliases: not emitted today, enrolled so a future generator stamp under
  // one of these names cannot fail the gate on its own.
  // Timestamps written by the publish plugin on every re-publish.
  'qdb_published_on',
  'publishedOn',
  'published_on',

  // The moment the gzip blob was written (changes on every re-publish run).
  'qdb_last_generated_on',
  'lastGeneratedOn',
  'last_generated_on',
  'generatedOn',
  'generated_on',

  // Build version of the generator plugin (bumps with every plugin deployment).
  'qdb_generator_version',
  'generatorVersion',
  'generator_version',

  // Timing metric — varies per run with no content significance.
  'qdb_generation_duration_ms',
  'generationDurationMs',
  'generation_duration_ms',
]);
