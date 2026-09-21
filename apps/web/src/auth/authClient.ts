import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});

function authError(message: string | undefined, fallback: string): Error {
  return new Error(message ?? fallback);
}

/** Starts Google sign-in while preserving a signed OAuth authorization request. */
export async function startGoogleSignIn(): Promise<void> {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: `${window.location.origin}/login`,
    errorCallbackURL: `${window.location.origin}/login?error=google`,
  });

  if (error !== null) {
    throw authError(error.message, "Google sign-in could not be started");
  }
}

export type OAuthClientSummary = {
  name: string;
};

/** Reads only the public metadata needed to identify the requesting client. */
export async function getOAuthClient(clientId: string): Promise<OAuthClientSummary> {
  const { data, error } = await authClient.oauth2.publicClient({
    query: { client_id: clientId },
  });

  if (error !== null || data === null) {
    throw authError(error?.message, "The requesting application could not be identified");
  }

  return { name: data.client_name ?? "ChatGPT" };
}

/** Completes the signed OAuth request; Better Auth performs the safe redirect. */
export async function decideOAuthConsent(accept: boolean): Promise<void> {
  const { error } = await authClient.oauth2.consent({ accept });

  if (error !== null) {
    throw authError(error.message, "The connection request could not be completed");
  }
}
