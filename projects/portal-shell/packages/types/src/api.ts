// ---------------------------------------------------------------------------
// API envelope types shared across all endpoints
// ---------------------------------------------------------------------------

export interface ApiResponseMeta {
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiResponseMeta;
}

/**
 * RFC 7807 Problem Details shape used for all error responses.
 * HTTP status is set on the response; this body carries structured detail.
 */
export interface ApiError {
  /** Machine-readable error code, e.g. "validation_error", "unauthorized" */
  code: string;
  /** Human-readable message safe to surface in the UI */
  message: string;
  /** Optional structured context (validation field errors, correlation ID, etc.) */
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Pagination query schema
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
