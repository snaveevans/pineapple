type LogLevel = "error" | "info";

type LogContext = Record<string, unknown>;

const writeLog = (
  level: LogLevel,
  message: string,
  context: LogContext = {},
): void => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.info(serialized);
};

export const logger = {
  error: (message: string, context?: LogContext): void => {
    writeLog("error", message, context);
  },
  info: (message: string, context?: LogContext): void => {
    writeLog("info", message, context);
  },
};
