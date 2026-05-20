import type { Request, Response, NextFunction } from 'express';

const HTML_TAG_PATTERN = /<[^>]*>/g;
const NULL_BYTE_PATTERN = /\x00/g;

function sanitiseString(value: string): string {
  return value.replace(NULL_BYTE_PATTERN, '').replace(HTML_TAG_PATTERN, '');
}

function sanitiseValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitiseString(value);
  if (Array.isArray(value)) return value.map(sanitiseValue);
  if (value !== null && typeof value === 'object') return sanitiseObject(value as Record<string, unknown>);
  return value;
}

function sanitiseObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = sanitiseValue(val);
  }
  return result;
}

// Strips HTML tags and null bytes from all string values in req.body at the
// API boundary. Rich text fields are stored as HTML and must bypass this —
// they are rendered through tiptap's schema parser on the frontend (no innerHTML).
export function inputSanitiserMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitiseObject(req.body as Record<string, unknown>);
  }
  next();
}
