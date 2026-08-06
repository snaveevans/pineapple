/**
 * Reads wrangler's migration bookkeeping table (`d1_migrations`), which is
 * created and maintained by `wrangler d1 migrations apply` — not by our own
 * migrations. GET /health uses this to surface schema drift: migrations are
 * applied separately from the code deploy (see
 * docs/specs/cross-cutting/schema-migrations.md), so the deployed code version
 * and the latest applied migration can legitimately disagree.
 */
export class D1MigrationStatus {
  constructor(private readonly db: D1Database) {}

  /** Filename of the latest applied migration (e.g. "0015_activity_actor_display_name.sql"), or null if none. */
  async latestAppliedMigration(): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1")
      .first<{ name: string }>();
    return row?.name ?? null;
  }
}
