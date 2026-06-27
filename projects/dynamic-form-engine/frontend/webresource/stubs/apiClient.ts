// Stub for src/api/apiClient.ts in the in-CRM build. The real (axios + MSAL) client is not
// bundled; any transitive caller that still reaches the HTTP client fails clearly rather than
// pulling authentication code into the web resource.
export class ApiClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly httpStatus: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function unavailable(): never {
  throw new ApiClientError('HTTP backend is not available in the in-CRM form engine.', 'NO_BACKEND', 0);
}

const apiClient = {
  get: unavailable,
  post: unavailable,
  put: unavailable,
  delete: unavailable,
};

export default apiClient;
