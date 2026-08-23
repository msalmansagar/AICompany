/**
 * Whether an image URL configured by a maker is safe to put in an <img src>.
 *
 * Only absolute http and https URLs pass. This exists because the alternatives are actively
 * dangerous or useless in this product:
 *
 *   - javascript: executes when some browsers resolve it, so a maker with designer access
 *     could reach every user of the form.
 *   - data: would let a maker embed arbitrary bytes in the form definition, which the size
 *     gates on the published JSON are not written to expect.
 *   - A relative path resolves against whatever host is serving the form, which differs
 *     between the portal, the CRM web resource and local dev — it can only ever be broken
 *     in at least one of them.
 *
 * Passing this check is NOT the same as being allowed to load: the portal's CSP still has to
 * name the host, and an external image request tells that host the viewer's IP and
 * user-agent, which is a PDPPL question rather than a technical one.
 */
export function isRenderableImageUrl(url: string | undefined | null): boolean {
  if (!url) return false;

  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    // Not an absolute URL at all.
    return false;
  }
}

/** The URL when it is safe to render, otherwise undefined — for use directly in an src. */
export function renderableImageUrl(url: string | undefined | null): string | undefined {
  return isRenderableImageUrl(url) ? (url as string) : undefined;
}
