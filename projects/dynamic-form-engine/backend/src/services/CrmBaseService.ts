import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { CrmApiError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

export class CrmBaseService {
  protected readonly baseUrl: string;

  constructor(protected readonly authService: CrmAuthService) {
    this.baseUrl = `${config.DATAVERSE_URL}/api/data/v9.2`;
  }

  protected async crmFetch<T>(
    path: string,
    options: RequestInit = {},
    attempt = 1,
  ): Promise<T> {
    const token = await this.authService.getAccessToken();
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"',
        ...options.headers,
      },
    });

    if (response.status === 429 && attempt <= MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? 1);
      const delay = Math.max(retryAfter * 1000, BASE_DELAY_MS * 2 ** (attempt - 1));
      const jitter = Math.random() * 200;

      logger.warn({ url, attempt, delayMs: delay + jitter }, 'Dataverse throttled — retrying');
      await this.sleep(delay + jitter);
      return this.crmFetch<T>(path, options, attempt + 1);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new CrmApiError(
        `Dataverse API error: ${response.status} ${response.statusText} — ${body}`,
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  protected buildSelect(attributes: string[]): string {
    return `$select=${attributes.join(',')}`;
  }

  protected buildFilter(filter: string): string {
    return `$filter=${encodeURIComponent(filter)}`;
  }

  protected buildOrderBy(field: string, direction: 'asc' | 'desc' = 'asc'): string {
    return `$orderby=${field} ${direction}`;
  }

  protected buildTop(count: number): string {
    return `$top=${count}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
