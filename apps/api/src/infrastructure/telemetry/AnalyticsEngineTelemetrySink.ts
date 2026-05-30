export type TelemetryDataPoint = {
  indexes: string[];
  blobs: string[];
  doubles: number[];
};

export interface TelemetrySink {
  write(dataPoint: TelemetryDataPoint): void;
}

export class AnalyticsEngineTelemetrySink implements TelemetrySink {
  constructor(private readonly dataset: AnalyticsEngineDataset) {}

  write(dataPoint: TelemetryDataPoint): void {
    try {
      this.dataset.writeDataPoint(dataPoint);
    } catch (error) {
      console.error({ error }, "Analytics Engine telemetry write failed");
    }
  }
}
