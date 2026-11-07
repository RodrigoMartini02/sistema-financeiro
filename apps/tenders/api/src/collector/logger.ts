// Log estruturado do coletor: uma linha JSON por evento, no console (os logs
// do Render Cron Job leem a saída padrão). Sem dependência nova.

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogContext = Record<string, unknown>;

export interface CollectorLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

type LogWriter = (line: string, level: LogLevel) => void;

const writeToConsole: LogWriter = (line, level) => {
  if (level === 'error' || level === 'warn') {
    console.error(line);
    return;
  }
  console.log(line);
};

/** Erros viram { name, message }: o JSON.stringify de um Error sai vazio. */
function serializeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      value instanceof Error ? { name: value.name, message: value.message } : value,
    ]),
  );
}

export function createCollectorLogger(minimumLevel: LogLevel, write: LogWriter = writeToConsole): CollectorLogger {
  const minimumRank = LOG_LEVELS.indexOf(minimumLevel);

  const log = (level: LogLevel, message: string, context: LogContext = {}) => {
    if (LOG_LEVELS.indexOf(level) < minimumRank) {
      return;
    }
    write(JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...serializeContext(context) }), level);
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
