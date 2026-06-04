import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { ApiResponse, ApiError } from '@qdb/shared';

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.correlationId ?? 'unknown';

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.');
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }

    const apiError: ApiError = {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: fieldErrors,
      correlationId,
    };

    const response: ApiResponse<never> = { success: false, error: apiError };
    res.status(400).json(response);
    return;
  }

  if (error instanceof AppError) {
    logger.warn({ correlationId, code: error.code, message: error.message }, 'Application error');

    const apiError: ApiError = {
      code: error.code,
      message: error.message,
      correlationId,
    };

    const response: ApiResponse<never> = { success: false, error: apiError };
    res.status(error.statusCode).json(response);
    return;
  }

  logger.error({ correlationId, error }, 'Unhandled error');

  const apiError: ApiError = {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    correlationId,
  };

  const response: ApiResponse<never> = { success: false, error: apiError };
  res.status(500).json(response);
}
