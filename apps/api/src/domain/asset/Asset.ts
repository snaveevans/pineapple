import { AssetId, TeamId, UserId, ValidationError } from "@snaveevans/pineapple-shared";
import { validateMetadata, type AssetMetadata } from "./AssetMetadata.ts";
import type { AssetType } from "./AssetType.ts";
import type { DomainEvent } from "../events/DomainEvent.ts";
import { AssetCreated } from "./events/AssetCreated.ts";
import { AssetSharedToTeam } from "./events/AssetSharedToTeam.ts";
import { AssetUnsharedFromTeam } from "./events/AssetUnsharedFromTeam.ts";

export class Asset {
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    readonly id: AssetId,
    readonly ownerId: UserId,
    public name: string,
    public metadata: AssetMetadata,
    public archivedAt: Date | null,
    readonly createdAt: Date,
    public updatedAt: Date,
    private _sharedTeamId: TeamId | null,
  ) {}

  get type(): AssetType {
    return this.metadata.kind;
  }

  get sharedTeamId(): TeamId | null {
    return this._sharedTeamId;
  }

  get isShared(): boolean {
    return this._sharedTeamId !== null;
  }

  static create(props: { ownerId: UserId; name: string; metadata: AssetMetadata }): Asset {
    if (!props.name?.trim()) {
      throw new ValidationError("Asset name is required", "name");
    }
    validateMetadata(props.metadata);

    const now = new Date();
    const asset = new Asset(
      AssetId.generate(),
      props.ownerId,
      props.name.trim(),
      props.metadata,
      null,
      now,
      now,
      null,
    );
    asset._domainEvents.push(
      AssetCreated({
        assetId: asset.id,
        ownerId: asset.ownerId,
        actorId: asset.ownerId,
        assetName: asset.name,
        assetType: asset.type,
        ...(asset.metadata.kind === "vehicle" ? { assetModelYear: asset.metadata.year } : {}),
      }),
    );
    return asset;
  }

  static reconstitute(props: {
    id: AssetId;
    ownerId: UserId;
    name: string;
    metadata: AssetMetadata;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    sharedTeamId?: TeamId | null;
  }): Asset {
    return new Asset(
      props.id,
      props.ownerId,
      props.name,
      props.metadata,
      props.archivedAt,
      props.createdAt,
      props.updatedAt,
      props.sharedTeamId ?? null,
    );
  }

  rename(name: string): void {
    if (!name?.trim()) throw new ValidationError("Name required", "name");
    this.name = name.trim();
    this.updatedAt = new Date();
  }

  /**
   * Share this asset to a team. Idempotent when already shared to the same team
   * (no event). Cross-aggregate fields (teamName) are supplied by the application layer.
   *
   * If already shared to a *different* team, this overwrites `sharedTeamId` and emits
   * only `AssetSharedToTeam` — not `AssetUnsharedFromTeam` for the outgoing team.
   * Unreachable today (one team per user; share always targets the caller's team),
   * but when multi-team / team-switching lands, emit an unshare for the prior team
   * so durable consumers keep a complete audit trail (ADR-0010).
   */
  shareToTeam(props: { teamId: TeamId; teamName: string; actorId: UserId }): void {
    if (this._sharedTeamId === props.teamId) return;

    this._sharedTeamId = props.teamId;
    this.updatedAt = new Date();
    this._domainEvents.push(
      AssetSharedToTeam({
        assetId: this.id,
        ownerId: this.ownerId,
        actorId: props.actorId,
        assetName: this.name,
        teamId: props.teamId,
        teamName: props.teamName,
      }),
    );
  }

  /**
   * Return this asset to personal. Idempotent when already personal (no event).
   * teamName is supplied by the application layer for the durable event.
   */
  unshare(props: { actorId: UserId; teamId: TeamId; teamName: string }): void {
    if (this._sharedTeamId === null) return;

    this._sharedTeamId = null;
    this.updatedAt = new Date();
    this._domainEvents.push(
      AssetUnsharedFromTeam({
        assetId: this.id,
        ownerId: this.ownerId,
        actorId: props.actorId,
        assetName: this.name,
        teamId: props.teamId,
        teamName: props.teamName,
      }),
    );
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
