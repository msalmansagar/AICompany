/**
 * Turning a rejection into words, whatever shape it arrived in.
 *
 * `String(error)` looks like it handles anything and does not: on a plain object it produces
 * **`[object Object]`**, which is what a Collection Officer saw on the Communication Centre's
 * history panel during Phase 7 runtime validation. The pattern
 * `error instanceof Error ? error.message : String(error)` was in ten places across the workspace,
 * and every one of them could produce it.
 *
 * It produces it precisely where it matters most. `Xrm.WebApi` does **not** reject with an `Error`
 * — it rejects with a plain object carrying `message`, so the `instanceof` test fails and the
 * fallback runs. Every CRM read failure in the browser takes that branch.
 *
 * So this is the only permitted way to describe a caught value, and it is deliberately total: every
 * input produces something a person can read, and `[object Object]` is not reachable.
 */

/** The shapes a rejection actually arrives in, none of which is guaranteed to be an `Error`. */
interface MessageBearing {
  message?: unknown;
  error?: { message?: unknown };
}

const FALLBACK = 'An unexpected problem occurred.';

/**
 * Extracts a readable message from any caught value.
 *
 * **This is diagnostic text, not officer-facing copy.** It may carry the platform's own wording —
 * "Could not find a property named…" — which is exactly right in a log or a developer-facing
 * surface and exactly wrong in front of a Collection Officer. A screen that shows a failure to an
 * officer writes its own sentence; see `CommunicationCenter`'s history panel.
 */
export function describeFailure(value: unknown): string {
  if (typeof value === 'string') return value.trim() || FALLBACK;
  if (value instanceof Error) return value.message.trim() || FALLBACK;

  if (typeof value === 'object' && value !== null) {
    const bearing = value as MessageBearing;
    // Dataverse nests its own message one level down; the client API puts it at the top level.
    const message = typeof bearing.message === 'string' ? bearing.message
      : typeof bearing.error?.message === 'string' ? bearing.error.message
        : undefined;
    if (message && message.trim()) return message.trim();
  }

  // Never `String(value)`. That is the line that produced `[object Object]`.
  return FALLBACK;
}

/** The same value as a real `Error`, for callers that propagate rather than display. */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(describeFailure(value));
}
