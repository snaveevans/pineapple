import {
  type DomainError,
  DomainError as DomainErrorClass,
  err,
  ok,
  type Result,
  type UserId,
} from "@snaveevans/pineapple-shared";
import type { Asset } from "../../domain/asset/Asset.ts";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";
import type { AssetRepository } from "../../domain/asset/AssetRepository.ts";
import type { AssetType } from "../../domain/asset/AssetType.ts";

const MAX_SEARCH_RESULTS = 20;

export type SearchAssetsQuery = {
  ownerId: UserId;
  q: string;
};

export type SearchAssetResult = {
  id: string;
  name: string;
  type: AssetType;
  summary: string;
};

export class SearchAssets {
  constructor(private readonly assets: AssetRepository) {}

  async execute(query: SearchAssetsQuery): Promise<Result<SearchAssetResult[], DomainError>> {
    try {
      const terms = searchTerms(query.q);
      if (terms.length === 0) return ok([]);

      const assets = await this.assets.findByOwner(query.ownerId);
      const results = assets
        .filter((asset) => asset.archivedAt === null)
        .filter((asset) => matchesAllTerms(asset, terms))
        .sort((left, right) => compareSearchMatches(left, right, terms))
        .slice(0, MAX_SEARCH_RESULTS)
        .map(toSearchResult);

      return ok(results);
    } catch (error) {
      if (error instanceof DomainErrorClass) return err(error);
      throw error;
    }
  }
}

function searchTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

function matchesAllTerms(asset: Asset, terms: string[]): boolean {
  const searchablePartsByField = searchableParts(asset.metadata, asset.name).map((part) =>
    part.toLowerCase(),
  );
  return terms.every((term) => searchablePartsByField.some((part) => part.includes(term)));
}

function searchableParts(metadata: AssetMetadata, name: string): string[] {
  switch (metadata.kind) {
    case "vehicle":
      return compactStrings(
        name,
        metadata.make,
        metadata.model,
        String(metadata.year),
        metadata.vin,
      );
    case "property":
      return compactStrings(
        name,
        metadata.nickname,
        metadata.address.street,
        metadata.address.city,
        metadata.address.state,
        metadata.address.postalCode,
        metadata.address.country,
      );
    case "equipment":
      return compactStrings(
        name,
        metadata.manufacturer,
        metadata.modelNumber,
        metadata.serialNumber,
      );
  }
}

function compareSearchMatches(left: Asset, right: Asset, terms: string[]): number {
  const leftNameMatch = nameMatchesAnyTerm(left, terms);
  const rightNameMatch = nameMatchesAnyTerm(right, terms);
  if (leftNameMatch !== rightNameMatch) return leftNameMatch ? -1 : 1;

  const updatedAt = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updatedAt !== 0) return updatedAt;

  const leftName = left.name.toLowerCase();
  const rightName = right.name.toLowerCase();
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function nameMatchesAnyTerm(asset: Asset, terms: string[]): boolean {
  const name = asset.name.toLowerCase();
  return terms.some((term) => name.includes(term));
}

function toSearchResult(asset: Asset): SearchAssetResult {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    summary: summaryFor(asset.metadata),
  };
}

// Mirrors Asset Library card summaries; keep aligned with docs/specs/features/asset-library.md.
function summaryFor(metadata: AssetMetadata): string {
  switch (metadata.kind) {
    case "vehicle":
      return `${metadata.year} ${metadata.make} ${metadata.model}`;
    case "property":
      return `${metadata.address.street}, ${metadata.address.city}, ${metadata.address.state}`;
    case "equipment": {
      const manufacturerAndModel = compactStrings(metadata.manufacturer, metadata.modelNumber).join(
        " ",
      );
      if (manufacturerAndModel.length > 0) return manufacturerAndModel;
      const serialNumber = metadata.serialNumber?.trim();
      if (serialNumber !== undefined && serialNumber.length > 0) {
        return serialNumber;
      }
      return "Equipment details not added";
    }
  }
}

function compactStrings(...values: (string | undefined)[]): string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0);
}
