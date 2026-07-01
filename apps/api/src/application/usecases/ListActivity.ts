import {
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  ok,
  type Result,
} from "@snaveevans/pineapple-shared";
import type { ActivityReadModel } from "../../domain/activity/ActivityEntry.ts";
import type { ActivityLogQuery, ActivityLogRepository } from "../ports/ActivityLogRepository.ts";

export const DEFAULT_ACTIVITY_LIMIT = 25;
export const MAX_ACTIVITY_LIMIT = 50;

export class ListActivity {
  constructor(private readonly activityLog: ActivityLogRepository) {}

  async execute(query: ActivityLogQuery): Promise<Result<ActivityReadModel, DomainError>> {
    try {
      return ok(await this.activityLog.list(query));
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}
