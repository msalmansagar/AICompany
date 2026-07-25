/**
 * On-demand ISR revalidation endpoint (B-001 — DXP-P1-003).
 *
 * Called by the Fastify API's POST /api/admin/tokens/publish route after a
 * successful live cache rebuild. Triggers revalidatePath('/') so that all
 * Next.js server-rendered pages pick up the new token CSS variables immediately
 * rather than waiting up to 5 minutes for the ISR revalidation window.
 *
 * Authentication: shared secret in the `x-revalidate-secret` request header.
 * The secret must match NEXTJS_REVALIDATE_SECRET in the Next.js environment.
 *
 * Request:
 *   POST /api/revalidate
 *   x-revalidate-secret: <secret>
 *   Content-Type: application/json
 *   Body: { "path": "/" }
 *
 * Response:
 *   200 { "revalidated": true }   — revalidation triggered
 *   401 { "error": "..." }        — missing or invalid secret
 *   400 { "error": "..." }        — missing path in body
 */

import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const REVALIDATE_SECRET = process.env['NEXTJS_REVALIDATE_SECRET'];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get('x-revalidate-secret');

  if (!REVALIDATE_SECRET || secret !== REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Invalid revalidation secret' }, { status: 401 });
  }

  let body: { path?: string };
  try {
    body = (await request.json()) as { path?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const path = body.path ?? '/';

  revalidatePath(path);

  return NextResponse.json({ revalidated: true, path });
}
