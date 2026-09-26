import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "@snaveevans/pineapple-shared";

/** Error messages are allowlisted; domain and database exception text can contain private input. */
export function safeMcpError(error: unknown) {
  const detail =
    error instanceof UnauthorizedError
      ? { code: "UNAUTHORIZED", message: "Reconnect Pineapple to authorize this request." }
      : error instanceof ForbiddenError
        ? { code: "FORBIDDEN", message: "This connection cannot perform that action." }
        : error instanceof NotFoundError
          ? { code: "NOT_FOUND", message: "The requested item is unavailable." }
          : error instanceof ConflictError
            ? {
                code: "CONFLICT",
                message:
                  "The item or operation has changed. Refresh its context before trying a new action.",
              }
            : error instanceof ValidationError
              ? {
                  code: "VALIDATION_ERROR",
                  message: "The change is invalid. Check the supplied fields.",
                }
              : error instanceof ServiceUnavailableError
                ? {
                    code: "WRITES_UNAVAILABLE",
                    message: "Pineapple changes are temporarily unavailable.",
                  }
                : {
                    code: "INTERNAL_ERROR",
                    message:
                      "Pineapple could not complete the request. Retry with the same operation ID.",
                  };
  const output = { error: detail };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
  };
}
