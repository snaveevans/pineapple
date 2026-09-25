import { describe, expect, it } from "vitest";
import { googleSignInURLs } from "./authClient.ts";

describe("googleSignInURLs", () => {
  it("returns ordinary sign-in to the login page", () => {
    expect(googleSignInURLs("https://pineapple.txe.app", "")).toEqual({
      callbackURL: "https://pineapple.txe.app/login",
      errorCallbackURL: "https://pineapple.txe.app/login?error=google",
    });
  });

  it("preserves a signed MCP continuation when Google returns an error", () => {
    const urls = googleSignInURLs(
      "https://pineapple.txe.app",
      "?client_id=chatgpt&ba_param=client_id&ba_param=redirect_uri&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&sig=signed",
    );

    expect(urls.callbackURL).toBe("https://pineapple.txe.app/login");
    expect(urls.errorCallbackURL).toBe(
      "https://pineapple.txe.app/login?client_id=chatgpt&ba_param=client_id&ba_param=redirect_uri&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&sig=signed&error=google",
    );
  });
});
