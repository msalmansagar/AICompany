type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function buildLogger() {
  function log(level: LogLevel, entry: Omit<LogEntry, 'level'>): void {
    if (__DEV__) {
      // eslint-disable-next-line no-console -- development-only structured output
      console.log(JSON.stringify({ level, ...entry, timestamp: new Date().toISOString() }));
    }
    // Production: wire to Sentry/Crashlytics breadcrumbs in Phase 2
  }

  return {
    debug: (entry: Omit<LogEntry, 'level'>) => log('debug', entry),
    info:  (entry: Omit<LogEntry, 'level'>) => log('info', entry),
    warn:  (entry: Omit<LogEntry, 'level'>) => log('warn', entry),
    error: (entry: Omit<LogEntry, 'level'>) => log('error', entry),
  };
}

export const logger = buildLogger();
