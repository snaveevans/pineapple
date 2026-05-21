import { AssetId } from "@snaveevans/pineapple-shared";

export default class Asset {
  private constructor(
    readonly id: AssetId,
    public name: string,
  ) {}

  static create(props: { name: string }): Asset {
    if (!props.name.trim()) {
      throw new Error("Asset name is required");
    }
    return new Asset(AssetId.generate(), props.name.trim());
  }
}
