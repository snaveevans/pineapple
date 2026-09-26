import { ValidationError } from "@snaveevans/pineapple-shared";
import type { AgentAssetMetadataPatch } from "../ports/AgentOperationExecutor.ts";
import type { AssetMetadata } from "../../domain/asset/AssetMetadata.ts";

/** Merge an agent's partial asset edit without dropping private or omitted metadata. */
export function mergeAgentAssetMetadataPatch(
  current: AssetMetadata,
  patch: AgentAssetMetadataPatch,
): AssetMetadata {
  if (current.kind !== patch.kind) {
    throw new ValidationError("Asset type cannot change", "metadata.kind");
  }

  switch (current.kind) {
    case "vehicle": {
      if (patch.kind !== "vehicle") {
        throw new ValidationError("Asset type cannot change", "metadata.kind");
      }
      return {
        kind: "vehicle",
        make: patch.make ?? current.make,
        model: patch.model ?? current.model,
        year: patch.year ?? current.year,
        ...(patch.vin === null
          ? {}
          : patch.vin !== undefined
            ? { vin: patch.vin }
            : current.vin !== undefined
              ? { vin: current.vin }
              : {}),
      };
    }
    case "property": {
      if (patch.kind !== "property") {
        throw new ValidationError("Asset type cannot change", "metadata.kind");
      }
      return {
        kind: "property",
        ...(patch.nickname === null
          ? {}
          : patch.nickname !== undefined
            ? { nickname: patch.nickname }
            : current.nickname !== undefined
              ? { nickname: current.nickname }
              : {}),
        address: { ...current.address, ...patch.address },
      };
    }
    case "equipment": {
      if (patch.kind !== "equipment") {
        throw new ValidationError("Asset type cannot change", "metadata.kind");
      }
      return {
        kind: "equipment",
        ...(patch.manufacturer === null
          ? {}
          : patch.manufacturer !== undefined
            ? { manufacturer: patch.manufacturer }
            : current.manufacturer !== undefined
              ? { manufacturer: current.manufacturer }
              : {}),
        ...(patch.modelNumber === null
          ? {}
          : patch.modelNumber !== undefined
            ? { modelNumber: patch.modelNumber }
            : current.modelNumber !== undefined
              ? { modelNumber: current.modelNumber }
              : {}),
        ...(patch.serialNumber === null
          ? {}
          : patch.serialNumber !== undefined
            ? { serialNumber: patch.serialNumber }
            : current.serialNumber !== undefined
              ? { serialNumber: current.serialNumber }
              : {}),
      };
    }
  }
}
