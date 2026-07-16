import { describe, expect, it } from "vitest";
import { AssetId, Email, TeamId, UserId } from "@snaveevans/pineapple-shared";
import { Asset } from "../../domain/asset/Asset.ts";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import { User } from "../../domain/identity/User.ts";
import type { UserRepository } from "../../domain/identity/UserRepository.ts";
import { SearchAssets } from "./SearchAssets.ts";

class AssetRepositoryFake implements AssetRepository {
  requestedUserId: UserId | null = null;

  constructor(private readonly assets: Asset[]) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }

  findVisibleTo(userId: UserId): Promise<Asset[]> {
    this.requestedUserId = userId;
    return Promise.resolve(this.assets);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class UserRepositoryFake implements UserRepository {
  constructor(private readonly users: User[] = []) {}

  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByIds(ids: readonly UserId[]): Promise<User[]> {
    return Promise.resolve(this.users.filter((user) => ids.includes(user.id)));
  }

  findByEmail(): Promise<User | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

const ownerId = UserId.from("195d0ef0-47f5-439f-abfd-29f892c9a040");
const otherOwnerId = UserId.from("d614dbf6-7f08-4c2d-aab9-091c8c2633dd");
const teamId = TeamId.from("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

function asset(props: {
  id: string;
  name: string;
  metadata: AssetMetadata;
  ownerId?: UserId;
  archivedAt?: Date | null;
  updatedAt?: Date;
  sharedTeamId?: TeamId | null;
}): Asset {
  return Asset.reconstitute({
    id: AssetId.from(props.id),
    ownerId: props.ownerId ?? ownerId,
    name: props.name,
    metadata: props.metadata,
    archivedAt: props.archivedAt ?? null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: props.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    sharedTeamId: props.sharedTeamId ?? null,
  });
}

async function search(assets: Asset[], q: string, users: User[] = []) {
  const repository = new AssetRepositoryFake(assets);
  const result = await new SearchAssets(repository, new UserRepositoryFake(users)).execute({
    requesterId: ownerId,
    q,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  return { repository, results: result.value };
}

describe("SearchAssets", () => {
  it("searches the authenticated owner's active assets only", async () => {
    const active = asset({
      id: "00000000-0000-0000-0000-000000000001",
      name: "Work Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
    });
    const archived = asset({
      id: "00000000-0000-0000-0000-000000000002",
      name: "Archived Ram",
      metadata: { kind: "vehicle", make: "Ram", model: "1500", year: 2018 },
      archivedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    // The fake returns the visible set as-is; the owner/team access boundary is
    // enforced by findVisibleTo (see D1AssetRepository tests). Here we assert the
    // requester identity is passed through and archived assets are excluded.
    const { repository, results } = await search([active, archived], "ram");

    expect(repository.requestedUserId).toBe(ownerId);
    expect(results.map((result) => result.id)).toEqual([active.id]);
  });

  it("matches case-insensitive substrings across all type-specific metadata", async () => {
    const assets = [
      asset({
        id: "00000000-0000-0000-0000-000000000004",
        name: "Truck",
        metadata: {
          kind: "vehicle",
          make: "Ram",
          model: "2500",
          year: 2021,
          vin: "1C6RR7LT4GS123456",
        },
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000005",
        name: "Retreat",
        metadata: {
          kind: "property",
          nickname: "Lake cabin",
          address: {
            street: "12 Aspen Lane",
            city: "Frisco",
            state: "CO",
            postalCode: "80443",
            country: "USA",
          },
        },
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000006",
        name: "Generator",
        metadata: {
          kind: "equipment",
          manufacturer: "Honda",
          modelNumber: "EU2200i",
          serialNumber: "EAMT-1234567",
        },
      }),
    ];

    expect((await search(assets, "ram 250")).results.map((result) => result.name)).toEqual([
      "Truck",
    ]);
    expect((await search(assets, "lake frisc")).results.map((result) => result.name)).toEqual([
      "Retreat",
    ]);
    expect((await search(assets, "honda 2200")).results.map((result) => result.name)).toEqual([
      "Generator",
    ]);
  });

  it("does not match on the asset type enum", async () => {
    const vehicle = asset({
      id: "00000000-0000-0000-0000-000000000007",
      name: "Work asset",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
    });

    const { results } = await search([vehicle], "vehicle");

    expect(results).toEqual([]);
  });

  it("matches each search term within one searchable field", async () => {
    const vehicle = asset({
      id: "00000000-0000-0000-0000-000000000017",
      name: "Work Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
    });

    const { results } = await search([vehicle], "truck ram");

    expect(results.map((result) => result.id)).toEqual([vehicle.id]);
  });

  it("returns computed summaries using Asset Library formatting", async () => {
    const assets = [
      asset({
        id: "00000000-0000-0000-0000-000000000008",
        name: "Truck asset",
        metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000009",
        name: "Cabin asset",
        metadata: {
          kind: "property",
          address: {
            street: "12 Aspen Lane",
            city: "Frisco",
            state: "CO",
            postalCode: "80443",
            country: "USA",
          },
        },
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000010",
        name: "Generator asset",
        metadata: { kind: "equipment", manufacturer: "Honda", modelNumber: "EU2200i" },
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000011",
        name: "Trailer asset",
        metadata: { kind: "equipment", serialNumber: "TRL-123" },
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000012",
        name: "Spare asset",
        metadata: { kind: "equipment" },
      }),
    ];

    const { results } = await search(assets, "asset");
    const summaries = Object.fromEntries(results.map((result) => [result.name, result.summary]));

    expect(summaries).toMatchObject({
      "Truck asset": "2020 Ford F-150",
      "Cabin asset": "12 Aspen Lane, Frisco, CO",
      "Generator asset": "Honda EU2200i",
      "Trailer asset": "TRL-123",
      "Spare asset": "Equipment details not added",
    });
  });

  it("ranks name matches before metadata-only matches, then by updatedAt descending", async () => {
    const assets = [
      asset({
        id: "00000000-0000-0000-0000-000000000013",
        name: "Old Ram Name",
        metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000014",
        name: "New Metadata Match",
        metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2022 },
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000015",
        name: "Newer Ram Name",
        metadata: { kind: "vehicle", make: "Ford", model: "Transit", year: 2024 },
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ];

    const { results } = await search(assets, "ram");

    expect(results.map((result) => result.name)).toEqual([
      "Newer Ram Name",
      "Old Ram Name",
      "New Metadata Match",
    ]);
  });

  it("caps results at 20", async () => {
    const assets = Array.from({ length: 25 }, (_, index) =>
      asset({
        id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
        name: `Ford asset ${index + 1}`,
        metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
        updatedAt: new Date(`2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
      }),
    );

    const { results } = await search(assets, "ford");

    expect(results).toHaveLength(20);
    expect(results[0]?.name).toBe("Ford asset 25");
    expect(results[19]?.name).toBe("Ford asset 6");
  });

  it("returns an empty result array when nothing matches", async () => {
    const truck = asset({
      id: "00000000-0000-0000-0000-000000000016",
      name: "Work Truck",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
    });

    const { results } = await search([truck], "tractor");

    expect(results).toEqual([]);
  });

  it("includes personal sharing on owned personal assets", async () => {
    const truck = asset({
      id: "00000000-0000-0000-0000-000000000018",
      name: "Personal Ram",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
    });

    const { results } = await search([truck], "ram");

    expect(results[0]?.sharing).toEqual({
      scope: "personal",
      isOwner: true,
    });
  });

  it("includes team sharing without ownerDisplayName when the caller owns a shared asset", async () => {
    const truck = asset({
      id: "00000000-0000-0000-0000-000000000019",
      name: "Shared Ram",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
      sharedTeamId: teamId,
    });

    const { results } = await search([truck], "ram");

    expect(results[0]?.sharing).toEqual({
      scope: "team",
      isOwner: true,
    });
  });

  it("includes team sharing with ownerDisplayName when the asset is shared with the caller", async () => {
    const shared = asset({
      id: "00000000-0000-0000-0000-000000000020",
      name: "Teammate Ram",
      ownerId: otherOwnerId,
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
      sharedTeamId: teamId,
    });
    const teammate = User.reconstitute({
      id: otherOwnerId,
      email: Email.from("teammate@example.com"),
      name: "Pat",
      onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const { results } = await search([shared], "ram", [teammate]);

    expect(results[0]?.sharing).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
  });
});
