import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOAuthClient } from "./authClient.ts";

const publicClientPreloginMock = vi.hoisted(() => vi.fn());

vi.mock("better-auth/client", () => ({
  createAuthClient: () => ({ oauth2: { publicClientPrelogin: publicClientPreloginMock } }),
}));

vi.mock("@better-auth/oauth-provider/client", () => ({
  oauthProviderClient: () => ({}),
}));

beforeEach(() => {
  publicClientPreloginMock.mockReset();
});

describe("getOAuthClient", () => {
  it("uses the signed-request prelogin endpoint", async () => {
    publicClientPreloginMock.mockResolvedValue({ data: { client_name: "ChatGPT" }, error: null });

    await expect(getOAuthClient("chatgpt-client")).resolves.toEqual({ name: "ChatGPT" });
    expect(publicClientPreloginMock).toHaveBeenCalledWith({ client_id: "chatgpt-client" });
  });

  it("does not call a nameless registered client ChatGPT", async () => {
    publicClientPreloginMock.mockResolvedValue({ data: { client_name: null }, error: null });

    await expect(getOAuthClient("unnamed-client")).resolves.toEqual({
      name: "An unnamed application",
    });
  });

  it("rejects a signed request that the provider rejects", async () => {
    publicClientPreloginMock.mockResolvedValue({
      data: null,
      error: { message: "invalid_signature" },
    });

    await expect(getOAuthClient("forged-client")).rejects.toThrow("invalid_signature");
  });
});
