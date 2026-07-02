import { z } from "@hono/zod-openapi";

export const UserProfileResponseSchema = z
  .object({
    email: z.string().email().openapi({ example: "dale@example.com" }),
    name: z.string().nullable().openapi({ example: "Dale" }),
    onboardingCompletedAt: z
      .string()
      .datetime()
      .nullable()
      .openapi({ example: "2026-06-11T12:00:00.000Z" }),
    notificationEmail: z.string().email().nullable().openapi({
      example: "contact@example.com",
      description:
        "User-controlled contact email reminders may be sent to. Null when unset; distinct from the read-only provider auth email.",
    }),
    notificationEmailVerified: z.boolean().openapi({
      example: false,
      description:
        "Whether the contact email is verified. Reminder emails are only delivered when true.",
    }),
  })
  .openapi("UserProfile");

export const SetNotificationEmailBodySchema = z
  .object({
    email: z
      .string()
      .email("A valid email address is required")
      .openapi({ example: "contact@example.com" }),
  })
  .openapi("SetNotificationEmailBody");

export const UpdateUserProfileBodySchema = z
  .object({
    name: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"))
      .openapi({ example: "DIYer Dale" }),
  })
  .openapi("UpdateUserProfileBody");
