// Structured client-side logger for the Dynamic Form Engine portal.
// Satisfies Article XIV of the technology constitution: no console.log in
// production code; every log entry carries operation context.
//
// In production builds (VITE_LOG_LEVEL=error) only 'error' entries are emitted.
// In development the full trace appears in the browser console as structured JSON.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
  [key: string]: unknown;
}

const SERVICE_NAME = 'dfe-portal';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function resolveMinLevel(): LogLevel {
  const raw = import.meta.env.VITE_LOG_LEVEL as string | undefined;
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return import.meta.env.MODE === 'production' ? 'error' : 'debug';
}

const MIN_LEVEL_PRIORITY = LOG_LEVEL_PRIORITY[resolveMinLevel()];

function emit(level: LogLevel, message: string, context: Record<string, unknown>): void {
  if (LOG_LEVEL_PRIORITY[level] < MIN_LEVEL_PRIORITY) return;

  const entry: LogEntry = {
    level,
    message,
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(output);
      break;
    case 'info':
      // eslint-disable-next-line no-console
      console.info(output);
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(output);
      break;
    case 'error':
      // eslint-disable-next-line no-console
      console.error(output);
      break;
  }
}

export const logger = {
  debug: (message: string, context: Record<string, unknown> = {}): void =>
    emit('debug', message, context),

  info: (message: string, context: Record<string, unknown> = {}): void =>
    emit('info', message, context),

  warn: (message: string, context: Record<string, unknown> = {}): void =>
    emit('warn', message, context),

  error: (message: string, context: Record<string, unknown> = {}): void =>
    emit('error', message, context),
};
