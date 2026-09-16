/**
 * A discriminated union Result type that makes failure explicit.
 * Never return null or undefined to signal failure — use Result<T, E>.
 *
 * No default for E — callers always write Result<T, DomainError> explicitly
 * so this module has zero intra-package dependencies and no circular reference risk.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
