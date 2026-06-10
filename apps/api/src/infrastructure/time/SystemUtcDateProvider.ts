import type { UtcDateProvider } from "../../application/ports/UtcDateProvider.ts";

export class SystemUtcDateProvider implements UtcDateProvider {
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
