import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from 'jose';

export interface MockOidcIssuer {
  /** The base URL of the mock issuer (e.g. http://127.0.0.1:PORT). */
  url: string;
  /**
   * Signs a JWT with the mock issuer's private key.
   * Pass `overrideIssuer` to inject a different `iss` claim while keeping the
   * same signing key — useful for testing issuer-mismatch rejection.
   */
  signToken(
    claims: Record<string, unknown>,
    ttlSeconds?: number,
    overrideIssuer?: string,
  ): Promise<string>;
  /** Stops the HTTP server. */
  stop(): Promise<void>;
}

/**
 * Starts an in-process mock OIDC issuer for auth-adapter tests.
 *
 * Exposes:
 *   GET  /.well-known/openid-configuration  — OIDC discovery document
 *   GET  /.well-known/jwks.json             — JWKS (RS256 public key)
 *   POST /token                             — client_credentials token endpoint
 *
 * The server binds to a random ephemeral port and returns its URL so multiple
 * test suites can run in parallel without port conflicts.
 */
export async function startMockOidcIssuer(): Promise<MockOidcIssuer> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const jwks = {
    keys: [{ ...publicJwk, kid: 'mock-key-1', use: 'sig', alg: 'RS256' }],
  };

  const server = createServer((req, res) => {
    handleRequest(req, res, privateKey, jwks, getBaseUrl(server)).catch((err: unknown) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(err) }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const issuer: MockOidcIssuer = {
    get url() {
      return getBaseUrl(server);
    },

    async signToken(claims, ttlSeconds = 3600, overrideIssuer) {
      return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'mock-key-1' })
        .setIssuedAt()
        .setIssuer(overrideIssuer ?? getBaseUrl(server))
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(privateKey);
    },

    stop() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };

  return issuer;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function getBaseUrl(server: Server): string {
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('Server address unavailable');
  }
  return `http://127.0.0.1:${addr.port}`;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  privateKey: KeyLike,
  jwks: object,
  baseUrl: string,
): Promise<void> {
  const url = req.url ?? '/';

  if (url === '/.well-known/openid-configuration') {
    sendJson(res, buildDiscoveryDocument(baseUrl));
    return;
  }

  if (url === '/.well-known/jwks.json') {
    sendJson(res, jwks);
    return;
  }

  if (url === '/token' && req.method === 'POST') {
    const token = await new SignJWT({ sub: 'service-account', scope: 'api' })
      .setProtectedHeader({ alg: 'RS256', kid: 'mock-key-1' })
      .setIssuedAt()
      .setIssuer(baseUrl)
      .setExpirationTime('1h')
      .sign(privateKey);

    sendJson(res, { access_token: token, token_type: 'Bearer', expires_in: 3600 });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

function buildDiscoveryDocument(baseUrl: string): Record<string, unknown> {
  return {
    issuer: baseUrl,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    token_endpoint: `${baseUrl}/token`,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    grant_types_supported: ['client_credentials'],
    response_types_supported: ['token'],
    id_token_signing_alg_values_supported: ['RS256'],
  };
}

function sendJson(res: ServerResponse, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}
