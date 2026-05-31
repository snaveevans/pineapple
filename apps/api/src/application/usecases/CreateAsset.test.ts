import { describe, expect, it } from "vitest";
import { UserId } from "@snaveevans/pineapple-shared";
import { CreateAsset, MAX_ACTIVE_ASSETS_PER_USER } from "./CreateAsset.ts";
import type { EventBus } from "../ports/EventBus.ts";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { AssetCreated } from "../../domain/asset/events/AssetCreated.ts";
import type { DomainEvent } from "../../domain/events/DomainEvent.ts";

class RecordingAssetRepository implements AssetRepository {
  saved: Asset | null = null;
  activeAssetCount = 0;

  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }

  findByOwner(): Promise<Asset[]> {
    return Promise.resolve([]);
  }

  countActiveByOwner(): Promise<number> {
    return Promise.resolve(this.activeAssetCount);
  }

  save(asset: Asset): Promise<void> {
    this.saved = asset;
    return Promise.resolve();
  }
}

class RecordingEventBus implements EventBus {
  readonly events: DomainEvent[] = [];

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.events.push(event);
    }
    return Promise.resolve();
  }

  subscribe(): void {}
}

describe("CreateAsset", () => {
  it("publishes AssetCreated after saving the asset", async () => {
    const repo = new RecordingAssetRepository();
    const eventBus = new RecordingEventBus();
    const ownerId = UserId.generate();

    const result = await new CreateAsset(repo, eventBus).execute({
      ownerId,
      name: "My Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });

    expect(result.ok).toBe(true);
    expect(repo.saved).not.toBeNull();
    expect(eventBus.events).toHaveLength(1);

    const event = eventBus.events[0] as AssetCreated | undefined;
    expect(event).toMatchObject({
      type: "AssetCreated",
      ownerId,
      assetType: "vehicle",
      assetModelYear: 2016,
    });
    expect(repo.saved?.pullEvents()).toHaveLength(0);
  });

  it("rejects creation after the active asset quota is reached", async () => {
    const repo = new RecordingAssetRepository();
    repo.activeAssetCount = MAX_ACTIVE_ASSETS_PER_USER;

    const result = await new CreateAsset(repo, new RecordingEventBus()).execute({
      ownerId: UserId.generate(),
      name: "My Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2016 },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Active asset limit reached" },
    });
    expect(repo.saved).toBeNull();
  });
});
