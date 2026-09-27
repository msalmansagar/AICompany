/**
 * The one place that decides what a Dataverse rejection *means*.
 *
 * Two channels reach this workspace and **they fail differently**, which is the whole reason this
 * file exists:
 *
 *   **The transport** answers with an HTTP status, so 404, 403 and 429 arrive as themselves.
 *   **`Xrm.WebApi`** rejects with a plain object — not an `Error` — carrying `errorCode`,
 *   `message`, `code`, `title` and `raw`, and **no `status` property at all**.
 *
 * Every caller that guessed at this got it wrong in the same direction. A check for
 * `error.status === 404` never matched a client-API rejection, so *the record is not there* was
 * reported as *the read failed* (KI-129) — and where the caller mapped the other way, a refusal
 * would have been reported as an absence, which is worse: on this organisation no DCP role can
 * read the Legal entity, so "you may not see this" is the **expected** answer for a real
 * Collection Officer, and rendering it as "there is none" would tell every officer that no
 * litigation exists (KI-111).
 *
 * Three rules follow, and none of them is negotiable:
 *
 *   **An unknown failure is never Not Found.** Absence must be positively identified.
 *   **Access denied is never absence.**
 *   **`instanceof Error` is not a discriminator**, because the rejections that matter most are not
 *   `Error`s, and stringifying an arbitrary object is not a contract.
 */

/** What a failed read actually was. */
export type DataverseFailure =
  /** The organisation does not hold this record. Positively identified — never a default. */
  | { kind: 'notFound' }
  /** The record exists and this identity may not see it. */
  | { kind: 'accessDenied' }
  /** Worth retrying: throttled, or the service was briefly unavailable. */
  | { kind: 'transient'; status?: number }
  /** Classified as nothing else. Deliberately the fallback, so absence is never assumed. */
  | { kind: 'unknown'; status?: number; errorCode?: number };

/**
 * `0x80040217` — the platform's own "record does not exist", as `Xrm.WebApi` reports it.
 *
 * Decimal because that is how the client API hands it over. **Observed**, not assumed: read from
 * `org5869857f` by asking for a record that was never created and inspecting the rejection.
 */
export const OBJECT_DOES_NOT_EXIST = 2147746327;

const NOT_FOUND = 404;
const UNAUTHORISED = 401;
const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

/**
 * Classifies any rejection from either channel.
 *
 * The status is consulted first because, where it exists, it is the platform speaking plainly.
 * `errorCode` is consulted second, and **only codes that have actually been observed are mapped** —
 * an unobserved code stays `unknown` rather than becoming a guess with a confident name.
 */
export function interpretRejection(error: unknown): DataverseFailure {
  const failure = asFailureShape(error);

  const byStatus = fromStatus(failure.status);
  if (byStatus) return byStatus;

  if (failure.errorCode === OBJECT_DOES_NOT_EXIST) return { kind: 'notFound' };

  return {
    kind: 'unknown',
    ...(failure.status !== undefined ? { status: failure.status } : {}),
    ...(failure.errorCode !== undefined ? { errorCode: failure.errorCode } : {}),
  };
}

/**
 * The HTTP reading, where the channel supplies one.
 *
 * **No client-API `errorCode` is mapped to `accessDenied`.** A permission denial through
 * `Xrm.WebApi` has not been observed on this organisation — every identity available for testing
 * is privileged — so inventing a code for it would be exactly the guess this module exists to
 * prevent. Until that shape is captured from a genuinely unprivileged session, permission denial
 * is proven only on the transport path, and a client-API refusal classifies as `unknown`: honest,
 * and never mistaken for absence.
 */
function fromStatus(status: number | undefined): DataverseFailure | null {
  if (status === undefined) return null;
  if (status === NOT_FOUND) return { kind: 'notFound' };
  if (status === FORBIDDEN || status === UNAUTHORISED) return { kind: 'accessDenied' };
  if (status === TOO_MANY_REQUESTS || status >= SERVER_ERROR) return { kind: 'transient', status };
  if (status >= 200 && status < 300) return null;
  return { kind: 'unknown', status };
}

/** Reads the two fields that carry meaning, from whatever shape arrived. */
function asFailureShape(error: unknown): { status?: number; errorCode?: number } {
  if (typeof error !== 'object' || error === null) return {};
  const candidate = error as { status?: unknown; errorCode?: unknown };
  return {
    ...(typeof candidate.status === 'number' ? { status: candidate.status } : {}),
    ...(typeof candidate.errorCode === 'number' ? { errorCode: candidate.errorCode } : {}),
  };
}

/** True only where absence was positively identified. Used where `null` means "not there". */
export function isNotFound(error: unknown): boolean {
  return interpretRejection(error).kind === 'notFound';
}
