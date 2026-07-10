import { z } from "@hono/zod-openapi";

export const CreateTeamBodySchema = z
  .object({
    name: z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(1, "Team name is required")
          .max(100, "Team name must be 100 characters or fewer"),
      )
      .openapi({ example: "Field Ops" }),
  })
  .openapi("CreateTeamBody");

export type CreateTeamBody = z.infer<typeof CreateTeamBodySchema>;

export const TeamMemberSchema = z
  .object({
    userId: z.string().openapi({ example: "7d914909-c903-41a4-a13a-82cbd0f61851" }),
    name: z.string().openapi({ example: "Dale" }),
    role: z.enum(["owner", "member"]).openapi({ example: "owner" }),
  })
  .openapi("TeamMember");

export const TeamResponseSchema = z
  .object({
    id: z.string().openapi({ example: "aaa11100-0000-0000-0000-000000000001" }),
    name: z.string().openapi({ example: "Field Ops" }),
    ownerId: z.string().openapi({ example: "7d914909-c903-41a4-a13a-82cbd0f61851" }),
    members: z.array(TeamMemberSchema),
    createdAt: z.string().datetime().openapi({ example: "2026-07-10T12:00:00.000Z" }),
  })
  .openapi("Team");

export const MyTeamResponseSchema = z
  .object({
    team: TeamResponseSchema.nullable(),
  })
  .openapi("MyTeam");
