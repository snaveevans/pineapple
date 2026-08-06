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

  /**
   * Filename of the latest applied migration (e.g. "0015_activity_actor_display_name.sql"),
   * or null when the migration state is unknown: no migration has ever been applied, or
   * the bookkeeping table itself is absent. The table only exists after `wrangler d1
   * migrations apply` has run — a database created or restored any other way (fresh
   * local/preview DB) doesn't have it. That is an unknown migration state, not a D1
   * outage, so it must not trip the health endpoint's 503; genuine query failures
   * (connectivity, permissions) are rethrown for the caller to classify.
   */
  async latestAppliedMigration(): Promise<string | null> {
    try {
      const row = await this.db
        .prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1")
        .first<{ name: string }>();
      return row?.name ?? null;
    } catch (error) {
      if (error instanceof Error && error.message.includes("no such table")) return null;
      throw error;
    }
  }
}
