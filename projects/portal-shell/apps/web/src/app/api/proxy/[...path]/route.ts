import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '../../../../lib/auth';

const API_BASE = process.env['API_URL'] ?? 'http://localhost:4001';

async function proxyHandler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const session = await auth();
  const accessToken = (session as unknown as Record<string, unknown>)?.['accessToken'] as
    | string
    | undefined;

  const { path } = await context.params;
  const apiPath = path.join('/');
  const targetUrl = new URL(`/api/${apiPath}`, API_BASE);

  // Forward query string from the original request
  req.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('Content-Type') ?? 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await req.text() : undefined;

  const upstream = await fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body,
  });

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const responseText = await upstream.text();
  return new NextResponse(responseText, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
}

export {
  proxyHandler as GET,
  proxyHandler as POST,
  proxyHandler as PUT,
  proxyHandler as PATCH,
  proxyHandler as DELETE,
};
