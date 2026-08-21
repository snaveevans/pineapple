import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authCss = readFileSync(new URL("./styles/auth.css", import.meta.url), "utf8");

describe("auth loading styles", () => {
  it("keeps the OAuth redirect spinner circular", () => {
    expect(authCss).toMatch(/\.au-spinner\s*\{[^}]*border-radius:\s*var\(--hf-r-full\);/s);
  });
});
