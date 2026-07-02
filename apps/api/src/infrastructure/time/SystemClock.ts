import type { Clock } from "../../application/ports/Clock.ts";

/** Wall-clock implementation of the {@link Clock} port. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
