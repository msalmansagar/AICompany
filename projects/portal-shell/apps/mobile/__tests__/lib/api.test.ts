import * as SecureStore from 'expo-secure-store';
import { api, ApiError } from '../../src/lib/api';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockJsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

const mockNoContentResponse = (): Response =>
  ({
    ok: true,
    status: 204,
    json: jest.fn(),
  }) as unknown as Response;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('constructor_validArgs_setsAllFields', () => {
    const error = new ApiError(404, 'Not found', { code: 'not_found' });

    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.body).toEqual({ code: 'not_found' });
    expect(error.name).toBe('ApiError');
    expect(error).toBeInstanceOf(Error);
  });

  it('constructor_nullBody_setsBodyToNull', () => {
    const error = new ApiError(500, 'Server error', null);

    expect(error.body).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// api.get
// ---------------------------------------------------------------------------

describe('api.get', () => {
  it('get_okResponse_returnsJsonBody', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJsonResponse(200, { data: 'hello' }));

    const result = await api.get<{ data: string }>('/api/test');

    expect(result).toEqual({ data: 'hello' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('get_errorResponse_throwsApiError', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockJsonResponse(404, { code: 'not_found' }),
    );

    await expect(api.get('/api/missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('get_errorResponse_apiErrorCarriesStatus', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockJsonResponse(401, { code: 'unauthorized' }),
    );

    try {
      await api.get('/api/protected');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
    }
  });

  it('get_204Response_returnsUndefined', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockNoContentResponse());

    const result = await api.get('/api/empty');

    expect(result).toBeUndefined();
  });

  it('get_storedAccessToken_includesBearerHeader', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('my-access-token');
    (global.fetch as jest.Mock).mockResolvedValue(mockJsonResponse(200, {}));

    await api.get('/api/protected');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer my-access-token',
    );
  });

  it('get_noStoredToken_omitsBearerHeader', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue(mockJsonResponse(200, {}));

    await api.get('/api/public');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// api.post
// ---------------------------------------------------------------------------

describe('api.post', () => {
  it('post_validBody_callsFetchWithPostMethodAndJsonBody', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJsonResponse(201, { id: 'new-1' }));

    await api.post('/api/items', { name: 'test' });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('post_serverError_throwsApiError', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJsonResponse(500, null));

    await expect(api.post('/api/items', {})).rejects.toBeInstanceOf(ApiError);
  });
});

// ---------------------------------------------------------------------------
// api.patch
// ---------------------------------------------------------------------------

describe('api.patch', () => {
  it('patch_validBody_callsFetchWithPatchMethod', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockJsonResponse(200, { updated: true }));

    await api.patch('/api/items/1', { name: 'updated' });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('PATCH');
  });
});

// ---------------------------------------------------------------------------
// api.delete
// ---------------------------------------------------------------------------

describe('api.delete', () => {
  it('delete_validPath_callsFetchWithDeleteMethod', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockNoContentResponse());

    await api.delete('/api/items/1');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('DELETE');
  });
});
