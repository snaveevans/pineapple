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
  findVisibleToCalls = 0;

  constructor(private readonly assets: Asset[]) {}

  findById(): Promise<Asset | null> {
    return Promise.resolve(null);
  }

  findVisibleTo(userId: UserId): Promise<Asset[]> {
    this.findVisibleToCalls += 1;
    this.requestedUserId = userId;
    return Promise.resolve(this.assets);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

class UserRepositoryFake implements UserRepository {
  findByIdsCalls: UserId[][] = [];

  constructor(private readonly users: User[] = []) {}

  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByIds(ids: readonly UserId[]): Promise<User[]> {
    this.findByIdsCalls.push([...ids]);
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
const thirdOwnerId = UserId.from("e725ec07-8f19-5d3e-bbc0-1a2d9d3744ee");
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

function user(id: UserId, name: string | null, email = "user@example.com"): User {
  return User.reconstitute({
    id,
    email: Email.from(email),
    name,
    onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

async function search(assets: Asset[], q: string, users: User[] = []) {
  const repository = new AssetRepositoryFake(assets);
  const userRepository = new UserRepositoryFake(users);
  const result = await new SearchAssets(repository, userRepository).execute({
    requesterId: ownerId,
    q,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  return { repository, userRepository, results: result.value };
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

  it("short-circuits empty and whitespace-only queries without loading assets", async () => {
    const truck = asset({
      id: "00000000-0000-0000-0000-000000000030",
      name: "Work Truck",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
    });

    for (const q of ["", "   ", "\t\n  "]) {
      const { repository, userRepository, results } = await search([truck], q);
      expect(results).toEqual([]);
      expect(repository.findVisibleToCalls).toBe(0);
      expect(userRepository.findByIdsCalls).toEqual([]);
    }
  });

  it("does not resolve owner names when every match is owned by the requester", async () => {
    const owned = asset({
      id: "00000000-0000-0000-0000-000000000031",
      name: "My Ram",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
    });
    const teammate = user(otherOwnerId, "Pat", "teammate@example.com");

    const { userRepository, results } = await search([owned], "ram", [teammate]);

    expect(userRepository.findByIdsCalls).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0]?.sharing).toEqual({
      scope: "personal",
      isOwner: true,
    });
    expect(results[0]?.sharing).not.toHaveProperty("ownerDisplayName");
  });

  it("resolves other owners only — never the requester — and maps display names", async () => {
    const owned = asset({
      id: "00000000-0000-0000-0000-000000000032",
      name: "My Ram",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
      sharedTeamId: teamId,
    });
    const sharedFromPat = asset({
      id: "00000000-0000-0000-0000-000000000033",
      name: "Pat Ram",
      ownerId: otherOwnerId,
      metadata: { kind: "vehicle", make: "Ram", model: "1500", year: 2019 },
      sharedTeamId: teamId,
    });
    const sharedFromSam = asset({
      id: "00000000-0000-0000-0000-000000000034",
      name: "Sam Ram",
      ownerId: thirdOwnerId,
      metadata: { kind: "vehicle", make: "Ram", model: "3500", year: 2022 },
      sharedTeamId: teamId,
    });
    const duplicatePatAsset = asset({
      id: "00000000-0000-0000-0000-000000000035",
      name: "Pat Second Ram",
      ownerId: otherOwnerId,
      metadata: { kind: "vehicle", make: "Ram", model: "Rebel", year: 2023 },
      sharedTeamId: teamId,
    });
    const users = [
      user(otherOwnerId, "Pat", "pat@example.com"),
      user(thirdOwnerId, "Sam", "sam@example.com"),
      user(ownerId, "Me", "me@example.com"),
    ];

    const { userRepository, results } = await search(
      [owned, sharedFromPat, sharedFromSam, duplicatePatAsset],
      "ram",
      users,
    );

    expect(userRepository.findByIdsCalls).toHaveLength(1);
    const requestedOwnerIds = userRepository.findByIdsCalls[0] ?? [];
    expect(requestedOwnerIds).toHaveLength(2);
    expect(new Set(requestedOwnerIds)).toEqual(new Set([otherOwnerId, thirdOwnerId]));
    expect(requestedOwnerIds).not.toContain(ownerId);

    const byName = Object.fromEntries(results.map((r) => [r.name, r.sharing]));
    expect(byName["My Ram"]).toEqual({ scope: "team", isOwner: true });
    expect(byName["My Ram"]).not.toHaveProperty("ownerDisplayName");
    expect(byName["Pat Ram"]).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
    expect(byName["Sam Ram"]).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Sam",
    });
    expect(byName["Pat Second Ram"]).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
  });

  it("uses Unknown when another owner is missing or has a null name", async () => {
    const missingOwnerAsset = asset({
      id: "00000000-0000-0000-0000-000000000036",
      name: "Missing Owner Ram",
      ownerId: otherOwnerId,
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
      sharedTeamId: teamId,
    });
    const nullNameAsset = asset({
      id: "00000000-0000-0000-0000-000000000037",
      name: "Null Name Ram",
      ownerId: thirdOwnerId,
      metadata: { kind: "vehicle", make: "Ram", model: "1500", year: 2018 },
      sharedTeamId: teamId,
    });

    const { results } = await search([missingOwnerAsset, nullNameAsset], "ram", [
      user(thirdOwnerId, null, "null@example.com"),
    ]);

    const byName = Object.fromEntries(results.map((r) => [r.name, r.sharing.ownerDisplayName]));
    expect(byName["Missing Owner Ram"]).toBe("Unknown");
    expect(byName["Null Name Ram"]).toBe("Unknown");
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
    expect((await search(assets, "1c6rr7lt")).results.map((result) => result.name)).toEqual([
      "Truck",
    ]);
    expect((await search(assets, "80443")).results.map((result) => result.name)).toEqual([
      "Retreat",
    ]);
    expect((await search(assets, "usa")).results.map((result) => result.name)).toEqual(["Retreat"]);
    expect((await search(assets, "eamt-123")).results.map((result) => result.name)).toEqual([
      "Generator",
    ]);
  });

  it("requires every search term to match (AND), not any term (OR)", async () => {
    const vehicle = asset({
      id: "00000000-0000-0000-0000-000000000038",
      name: "Work Truck",
      metadata: { kind: "vehicle", make: "Ram", model: "2500", year: 2021 },
    });

    const { results } = await search([vehicle], "truck tractor");

    expect(results).toEqual([]);
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
      asset({
        id: "00000000-0000-0000-0000-000000000039",
        name: "Whitespace serial asset",
        metadata: { kind: "equipment", serialNumber: "   " },
      }),
      asset({
        id: "00000000-0000-0000-0000-000000000040",
        name: "Manufacturer only asset",
        metadata: { kind: "equipment", manufacturer: "Kohler" },
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
      "Whitespace serial asset": "Equipment details not added",
      "Manufacturer only asset": "Kohler",
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

  it("breaks name ties by alphabetical name even when ids disagree", async () => {
    const sameInstant = new Date("2026-03-01T00:00:00.000Z");
    // Three names so inconsistent comparators cannot accidentally preserve order.
    // Ids are reverse of alphabetical order so id-only fallback cannot fake name sort.
    const charlie = asset({
      id: "00000000-0000-0000-0000-000000000010",
      name: "Charlie Ford",
      metadata: { kind: "vehicle", make: "Chevy", model: "C", year: 2020 },
      updatedAt: sameInstant,
    });
    const bravo = asset({
      id: "00000000-0000-0000-0000-000000000020",
      name: "Bravo Ford",
      metadata: { kind: "vehicle", make: "Chevy", model: "B", year: 2020 },
      updatedAt: sameInstant,
    });
    const alpha = asset({
      id: "00000000-0000-0000-0000-000000000030",
      name: "Alpha Ford",
      metadata: { kind: "vehicle", make: "Chevy", model: "A", year: 2020 },
      updatedAt: sameInstant,
    });

    const { results } = await search([charlie, bravo, alpha], "ford");

    expect(results.map((result) => result.name)).toEqual([
      "Alpha Ford",
      "Bravo Ford",
      "Charlie Ford",
    ]);
  });

  it("breaks identical-name ties by asset id ascending", async () => {
    const sameInstant = new Date("2026-03-01T00:00:00.000Z");
    // Input order is mid, high, low — id ascending must win regardless of input.
    const mid = asset({
      id: "00000000-0000-0000-0000-000000000050",
      name: "Same Name",
      metadata: { kind: "vehicle", make: "Ford", model: "M", year: 2020 },
      updatedAt: sameInstant,
    });
    const high = asset({
      id: "00000000-0000-0000-0000-000000000090",
      name: "Same Name",
      metadata: { kind: "vehicle", make: "Ford", model: "H", year: 2020 },
      updatedAt: sameInstant,
    });
    const low = asset({
      id: "00000000-0000-0000-0000-000000000010",
      name: "Same Name",
      metadata: { kind: "vehicle", make: "Ford", model: "L", year: 2020 },
      updatedAt: sameInstant,
    });

    const { results } = await search([mid, high, low], "ford");

    expect(results.map((result) => result.id)).toEqual([low.id, mid.id, high.id]);
  });

  it("ranks a lowercase name hit above metadata when the query is uppercase", async () => {
    const nameHit = asset({
      id: "00000000-0000-0000-0000-000000000060",
      name: "rambler",
      metadata: { kind: "vehicle", make: "Ford", model: "X", year: 2020 },
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const metaOnly = asset({
      id: "00000000-0000-0000-0000-000000000061",
      name: "Other",
      metadata: { kind: "vehicle", make: "RAM", model: "Y", year: 2020 },
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const { results } = await search([nameHit, metaOnly], "RAM");

    // nameMatchesAnyTerm lowercases the asset name; query terms are lowercased
    // in searchTerms — "rambler" must count as a name hit for term "ram".
    expect(results.map((r) => r.name)).toEqual(["rambler", "Other"]);
  });

  it("name-ranks when any single term hits the name (not every term)", async () => {
    // Both match AND across fields. Name contains only "truck"; "ford" is in metadata.
    // nameMatchesAnyTerm must use some() so this ranks above a metadata-only hit.
    const partialNameHit = asset({
      id: "00000000-0000-0000-0000-000000000047",
      name: "Alpha Truck",
      metadata: { kind: "vehicle", make: "Ford", model: "X", year: 2020 },
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const metaOnly = asset({
      id: "00000000-0000-0000-0000-000000000048",
      name: "Zed Unit",
      metadata: { kind: "vehicle", make: "Ford Truck", model: "Y", year: 2020 },
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const { results } = await search([partialNameHit, metaOnly], "truck ford");

    expect(results.map((r) => r.name)).toEqual(["Alpha Truck", "Zed Unit"]);
  });

  it("drops whitespace-only metadata parts from equipment summaries", async () => {
    const equipment = asset({
      id: "00000000-0000-0000-0000-000000000051",
      name: "Pump asset",
      metadata: {
        kind: "equipment",
        manufacturer: "  ",
        modelNumber: "MX-1",
        serialNumber: "\t",
      },
    });

    const { results } = await search([equipment], "pump");

    // compactStrings must trim + drop empty parts so join is "MX-1", not "  MX-1" / " MX-1".
    expect(results[0]?.summary).toBe("MX-1");
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
    const teammate = user(otherOwnerId, "Pat", "teammate@example.com");

    const { results } = await search([shared], "ram", [teammate]);

    expect(results[0]?.sharing).toEqual({
      scope: "team",
      isOwner: false,
      ownerDisplayName: "Pat",
    });
  });

  it("returns id, name, and type on each hit", async () => {
    const truck = asset({
      id: "00000000-0000-0000-0000-000000000049",
      name: "Work Truck",
      metadata: { kind: "vehicle", make: "Ford", model: "F-150", year: 2020 },
    });

    const { results } = await search([truck], "ford");

    expect(results[0]).toMatchObject({
      id: truck.id,
      name: "Work Truck",
      type: "vehicle",
      summary: "2020 Ford F-150",
    });
  });
});
