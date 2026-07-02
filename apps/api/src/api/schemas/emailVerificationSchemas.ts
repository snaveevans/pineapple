import { z } from "@hono/zod-openapi";

export const ConfirmEmailVerificationBodySchema = z
  .object({
    token: z.string().min(1, "Token is required").openapi({ example: "kQ8s2f...opaque-token" }),
  })
  .openapi("ConfirmEmailVerificationBody");

export const ConfirmEmailVerificationResponseSchema = z
  .object({
    status: z.enum(["verified", "invalid"]).openapi({
      example: "verified",
      description:
        "`verified` when the address is now confirmed; `invalid` is the single non-leaking outcome for any unknown, expired, used, superseded, or address-changed token.",
    }),
  })
  .openapi("ConfirmEmailVerificationResponse");

export const RequestEmailVerificationResponseSchema = z
  .object({
    status: z.literal("accepted").openapi({ example: "accepted" }),
  })
  .openapi("RequestEmailVerificationResponse");
