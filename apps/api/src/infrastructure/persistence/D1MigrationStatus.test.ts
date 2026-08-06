import { describe, expect, it, vi } from "vitest";
import { D1MigrationStatus } from "./D1MigrationStatus.ts";

function createDb(firstResult: unknown) {
  const prepare = vi.fn(() => ({
    first: vi.fn().mockResolvedValue(firstResult),
  }));
  return { db: { prepare } as unknown as D1Database, prepare };
}

function createFailingDb(error: Error) {
  const prepare = vi.fn(() => ({
    first: vi.fn().mockRejectedValue(error),
  }));
  return { db: { prepare } as unknown as D1Database, prepare };
}

describe("D1MigrationStatus", () => {
  it("returns the filename of the latest applied migration", async () => {
    const { db, prepare } = createDb({ name: "0015_activity_actor_display_name.sql" });

    const latest = await new D1MigrationStatus(db).latestAppliedMigration();

    expect(prepare).toHaveBeenCalledWith("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1");
    expect(latest).toBe("0015_activity_actor_display_name.sql");
  });

  it("returns null when no migrations have been applied", async () => {
    const { db } = createDb(null);

    const latest = await new D1MigrationStatus(db).latestAppliedMigration();

    expect(latest).toBeNull();
  });

  it("returns null when the d1_migrations bookkeeping table does not exist", async () => {
    // A database that never had `wrangler d1 migrations apply` run against it
    // (fresh local/preview DB) has no bookkeeping table — unknown migration
    // state, not a D1 outage.
    const { db } = createFailingDb(new Error("D1_ERROR: no such table: d1_migrations"));

    const latest = await new D1MigrationStatus(db).latestAppliedMigration();

    expect(latest).toBeNull();
  });

  it("rethrows genuine query failures for the caller to classify", async () => {
    const outage = new Error("D1_ERROR: network connection lost");
    const { db } = createFailingDb(outage);

    await expect(new D1MigrationStatus(db).latestAppliedMigration()).rejects.toBe(outage);
  });
});
