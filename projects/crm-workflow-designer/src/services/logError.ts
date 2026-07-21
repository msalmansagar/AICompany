/**
 * Structured client-side error reporting for the CRM web resource.
 *
 * Dispatches a window `ErrorEvent` (the host's error surface can subscribe) and
 * echoes to the console only in dev builds. Production builds stay silent,
 * satisfying the "no ungated console output in committed code" rule while
 * preserving developer visibility during local work.
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
  window.dispatchEvent(new ErrorEvent('error', { message: `[${context}] ${message}` }));
}
