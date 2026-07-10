// Import `z` from @hono/zod-openapi (not "zod") so schemas carry `.openapi()`
// metadata. This is the single source of truth for both runtime validation
// AND the generated OpenAPI spec — change a rule here and the docs follow.
import { z } from "@hono/zod-openapi";

// ── Requests ─────────────────────────────────────────────────────────────────

export const CreateTeamBodySchema = z
  .object({
    name: z.string().min(1, "Name is required").openapi({ example: "The Smiths" }),
  })
  .openapi("CreateTeamBody");

export type CreateTeamBody = z.infer<typeof CreateTeamBodySchema>;

// ── Responses ──────────────────────────────────────────────────────────────

/** Serialized team member, matching `serializeTeamMember` in worker.ts. */
export const TeamMemberResponseSchema = z
  .object({
    userId: z.string().openapi({ example: "7d914909-c903-41a4-a13a-82cbd0f61851" }),
    name: z.string().nullable().openapi({ example: "Dale" }),
    role: z.enum(["owner", "member"]).openapi({ example: "owner" }),
  })
  .openapi("TeamMember");

/** Serialized team, matching `serializeTeam` in worker.ts. */
export const TeamResponseSchema = z
  .object({
    id: z.string().openapi({ example: "195d0ef0-47f5-439f-abfd-29f892c9a040" }),
    name: z.string().openapi({ example: "The Smiths" }),
    ownerId: z.string().openapi({ example: "7d914909-c903-41a4-a13a-82cbd0f61851" }),
    members: z.array(TeamMemberResponseSchema),
    createdAt: z.string().datetime().openapi({ example: "2026-07-10T03:25:24.887Z" }),
  })
  .openapi("Team");

export const MyTeamResponseSchema = z
  .object({
    team: TeamResponseSchema.nullable(),
  })
  .openapi("MyTeamResponse");
