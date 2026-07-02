/**
 * Port: the current wall-clock instant. Injected so time-dependent use cases
 * (rate-limit windows, token expiry) are deterministic under test.
 */
export interface Clock {
  now(): Date;
}
