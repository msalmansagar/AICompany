/**
 * Logger.ts
 * Structured logger wrapper. In production (UCI context) delegates to
 * context.reporting; in tests / preview host uses console.
 * No console.log in committed code — structured entries only.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly component: string;
  readonly event: string;
  readonly data?: Record<string, unknown>;
}

export type LogSink = (entry: LogEntry) => void;

function defaultSink(entry: LogEntry): void {
  const msg = `[${entry.level.toUpperCase()}] ${entry.component}::${entry.event}`;
  if (entry.level === 'error') {
    console.error(msg, entry.data ?? {});
  } else if (entry.level === 'warn') {
    console.warn(msg, entry.data ?? {});
  }
  // info logs are suppressed in default sink — wire a real sink in production
}

export class Logger {
  private readonly component: string;
  private readonly sink: LogSink;

  public constructor(component: string, sink: LogSink = defaultSink) {
    this.component = component;
    this.sink = sink;
  }

  public info(event: string, data?: Record<string, unknown>): void {
    this.sink({ level: 'info', component: this.component, event, data });
  }

  public warn(event: string, data?: Record<string, unknown>): void {
    this.sink({ level: 'warn', component: this.component, event, data });
  }

  public error(event: string, data?: Record<string, unknown>): void {
    this.sink({ level: 'error', component: this.component, event, data });
  }

  /** Returns a child logger scoped to a sub-component */
  public child(subComponent: string): Logger {
    return new Logger(`${this.component}::${subComponent}`, this.sink);
  }
}
