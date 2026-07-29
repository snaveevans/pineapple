import { z } from "zod";

// The UX spec schema. Authored as YAML, validated here, emitted as ux.json —
// the same source → validate → generated-artifact shape the API spec uses.

const CopyEntry = z.union([
  z.string().min(1),
  z
    .object({
      text: z.string().min(1),
      // Set when the string is only shown because a dynamic source was absent
      // (e.g. the API returned no error message). Platforms need to know this
      // is a fallback and not the primary copy.
      fallbackFor: z.string().min(1),
    })
    .strict(),
]);

const Action = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    intent: z.enum(["primary", "secondary", "ghost"]),
    icon: z.string().min(1).optional(),
    // A route id, never a URL — routes differ per platform.
    target: z.string().min(1).optional(),
  })
  .strict();

const Param = z
  .object({
    type: z.string().min(1),
    transform: z.enum(["lowercase", "none"]).default("none"),
  })
  .strict();

const State = z
  .object({
    id: z.string().min(1),
    when: z.string().min(1),
    role: z.enum(["status", "alert"]).optional(),
    // Renders within the library rather than replacing it.
    inline: z.boolean().default(false),
    chrome: z
      .object({ toolbar: z.enum(["hidden", "visible"]) })
      .strict()
      .optional(),
    icon: z.string().min(1).optional(),
    tone: z.enum(["bad", "warn", "ok"]).optional(),
    copy: z.record(CopyEntry),
    params: z.record(Param).optional(),
    actions: z.array(Action).default([]),
  })
  .strict();

const Implementation = z
  .object({
    source: z.string().min(1),
    tests: z.string().min(1),
  })
  .strict();

export const ScreenSpec = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    routes: z.record(z.string().min(1)),
    goal: z.string().min(1),
    states: z.array(State).min(1),
    implementations: z.record(Implementation),
  })
  .strict();

export type ScreenSpec = z.infer<typeof ScreenSpec>;
export type StateSpec = ScreenSpec["states"][number];
export type CopyValue = z.infer<typeof CopyEntry>;

export function copyText(value: CopyValue): string {
  return typeof value === "string" ? value : value.text;
}
