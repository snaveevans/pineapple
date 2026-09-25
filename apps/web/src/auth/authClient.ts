import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});

function authError(message: string | undefined, fallback: string): Error {
  return new Error(message ?? fallback);
}

export function googleSignInURLs(
  origin = window.location.origin,
  search = window.location.search,
): { callbackURL: string; errorCallbackURL: string } {
  const callbackURL = new URL("/login", origin);
  const errorCallbackURL = new URL(callbackURL);
  errorCallbackURL.search = search;
  errorCallbackURL.searchParams.set("error", "google");

  return {
    callbackURL: callbackURL.toString(),
    errorCallbackURL: errorCallbackURL.toString(),
  };
}

/** Starts Google sign-in while preserving a signed OAuth authorization request. */
export async function startGoogleSignIn(): Promise<void> {
  const urls = googleSignInURLs();
  const { error } = await authClient.signIn.social({
    provider: "google",
    ...urls,
  });

  if (error !== null) {
    throw authError(error.message, "Google sign-in could not be started");
  }
}

export type OAuthClientSummary = {
  name: string;
};

/** Verifies the signed authorization request and reads its public client name. */
export async function getOAuthClient(clientId: string): Promise<OAuthClientSummary> {
  // The oauth-provider client includes the signed URL query on this POST.
  // The provider rejects forged or expired requests before returning metadata.
  const { data, error } = await authClient.oauth2.publicClientPrelogin({
    client_id: clientId,
  });

  if (error !== null || data === null) {
    throw authError(error?.message, "The requesting application could not be identified");
  }

  // Anonymous dynamic registration can omit client_name. Never invent a
  // trusted-sounding name for a client that did not supply one.
  return { name: data.client_name?.trim() || "An unnamed application" };
}

/** Completes the signed OAuth request; Better Auth performs the safe redirect. */
export async function decideOAuthConsent(accept: boolean): Promise<void> {
  const { error } = await authClient.oauth2.consent({ accept });

  if (error !== null) {
    throw authError(error.message, "The connection request could not be completed");
  }
}
