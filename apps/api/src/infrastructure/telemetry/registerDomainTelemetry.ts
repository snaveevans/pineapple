import type { EventBus } from "../../application/ports/EventBus.ts";
import { AnalyticsEngineTelemetrySink } from "./AnalyticsEngineTelemetrySink.ts";
import { AssetCreatedTelemetryHandler } from "./asset/AssetCreatedTelemetryHandler.ts";
import { AssetSharedToTeamTelemetryHandler } from "./asset/AssetSharedToTeamTelemetryHandler.ts";
import { AssetUnsharedFromTeamTelemetryHandler } from "./asset/AssetUnsharedFromTeamTelemetryHandler.ts";
import { MaintenanceRecordCreatedTelemetryHandler } from "./maintenance/MaintenanceRecordCreatedTelemetryHandler.ts";
import { MaintenanceTaskAdvancedTelemetryHandler } from "./maintenance/MaintenanceTaskAdvancedTelemetryHandler.ts";
import { MaintenanceTaskCreatedTelemetryHandler } from "./maintenance/MaintenanceTaskCreatedTelemetryHandler.ts";
import { MaintenanceTaskDeletedTelemetryHandler } from "./maintenance/MaintenanceTaskDeletedTelemetryHandler.ts";
import { MaintenanceReminderCreatedTelemetryHandler } from "./notification/MaintenanceReminderCreatedTelemetryHandler.ts";
import { ReminderEmailDispatchedTelemetryHandler } from "./notification/ReminderEmailDispatchedTelemetryHandler.ts";
import { UserNameUpdatedTelemetryHandler } from "./user/UserNameUpdatedTelemetryHandler.ts";
import { UserOnboardingCompletedTelemetryHandler } from "./user/UserOnboardingCompletedTelemetryHandler.ts";
import { UserProvisionedTelemetryHandler } from "./user/UserProvisionedTelemetryHandler.ts";
import { TeamCreatedTelemetryHandler } from "./team/TeamCreatedTelemetryHandler.ts";

export function registerDomainTelemetry(deps: {
  eventBus: EventBus;
  assetDomainDataset: AnalyticsEngineDataset;
  maintenanceDomainDataset: AnalyticsEngineDataset;
  maintenanceTaskDomainDataset: AnalyticsEngineDataset;
  notificationDomainDataset: AnalyticsEngineDataset;
  userDomainDataset: AnalyticsEngineDataset;
  teamDomainDataset: AnalyticsEngineDataset;
}): void {
  const assetDomainSink = new AnalyticsEngineTelemetrySink(deps.assetDomainDataset);
  deps.eventBus.subscribe(new AssetCreatedTelemetryHandler(assetDomainSink));
  deps.eventBus.subscribe(new AssetSharedToTeamTelemetryHandler(assetDomainSink));
  deps.eventBus.subscribe(new AssetUnsharedFromTeamTelemetryHandler(assetDomainSink));

  const userDomainSink = new AnalyticsEngineTelemetrySink(deps.userDomainDataset);
  deps.eventBus.subscribe(new UserProvisionedTelemetryHandler(userDomainSink));
  deps.eventBus.subscribe(new UserOnboardingCompletedTelemetryHandler(userDomainSink));
  deps.eventBus.subscribe(new UserNameUpdatedTelemetryHandler(userDomainSink));

  const maintenanceDomainSink = new AnalyticsEngineTelemetrySink(deps.maintenanceDomainDataset);
  deps.eventBus.subscribe(new MaintenanceRecordCreatedTelemetryHandler(maintenanceDomainSink));

  const maintenanceTaskDomainSink = new AnalyticsEngineTelemetrySink(
    deps.maintenanceTaskDomainDataset,
  );
  deps.eventBus.subscribe(new MaintenanceTaskCreatedTelemetryHandler(maintenanceTaskDomainSink));
  deps.eventBus.subscribe(new MaintenanceTaskDeletedTelemetryHandler(maintenanceTaskDomainSink));
  deps.eventBus.subscribe(new MaintenanceTaskAdvancedTelemetryHandler(maintenanceTaskDomainSink));

  const notificationDomainSink = new AnalyticsEngineTelemetrySink(deps.notificationDomainDataset);
  deps.eventBus.subscribe(new MaintenanceReminderCreatedTelemetryHandler(notificationDomainSink));
  deps.eventBus.subscribe(new ReminderEmailDispatchedTelemetryHandler(notificationDomainSink));

  const teamDomainSink = new AnalyticsEngineTelemetrySink(deps.teamDomainDataset);
  deps.eventBus.subscribe(new TeamCreatedTelemetryHandler(teamDomainSink));
}
