-- Better Auth MCP/OAuth Provider schema (better-auth@1.7.5).
--
-- Generated from apps/api/src/infrastructure/auth/auth.ts with the official
-- `auth@1.7.5 generate` schema generator, then expressed for the native D1 /
-- Kysely adapter. Kysely uses Better Auth's camelCase model and field names;
-- this matches the existing singular core auth tables from 0002_better_auth.sql.
-- Every change is additive so this migration is safe before the Worker deploy.

CREATE TABLE IF NOT EXISTS "jwks" (
  "id"         text NOT NULL PRIMARY KEY,
  "publicKey"  text NOT NULL,
  "privateKey" text NOT NULL,
  "createdAt"  date NOT NULL,
  "expiresAt"  date,
  "alg"        text,
  "crv"        text
);

CREATE TABLE IF NOT EXISTS "oauthClient" (
  "id"                           text NOT NULL PRIMARY KEY,
  "clientId"                     text NOT NULL UNIQUE,
  "clientSecret"                 text,
  "clientDiscoveryId"            text,
  "disabled"                     integer DEFAULT 0,
  "skipConsent"                  integer,
  "enableEndSession"             integer,
  "subjectType"                  text,
  "scopes"                       text,
  "clientCredentialsScopes"      text DEFAULT '[]',
  "userId"                       text REFERENCES "user" ("id") ON DELETE CASCADE,
  "createdAt"                    date,
  "updatedAt"                    date,
  "name"                         text,
  "uri"                          text,
  "icon"                         text,
  "contacts"                     text,
  "tos"                          text,
  "policy"                       text,
  "softwareId"                   text,
  "softwareVersion"              text,
  "softwareStatement"            text,
  "redirectUris"                 text NOT NULL,
  "postLogoutRedirectUris"       text,
  "backchannelLogoutUri"         text,
  "backchannelLogoutSessionRequired" integer,
  "tokenEndpointAuthMethod"      text,
  "applicationType"              text,
  "jwks"                         text,
  "jwksUri"                      text,
  "grantTypes"                   text,
  "responseTypes"                text,
  "requirePKCE"                  integer,
  "dpopBoundAccessTokens"        integer DEFAULT 0,
  "referenceId"                  text,
  "metadata"                     text
);
CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx"
  ON "oauthClient" ("userId");

CREATE TABLE IF NOT EXISTS "oauthResource" (
  "id"                            text NOT NULL PRIMARY KEY,
  "identifier"                    text NOT NULL UNIQUE,
  "name"                          text NOT NULL,
  "accessTokenTtl"                integer,
  "refreshTokenTtl"               integer,
  "signingAlgorithm"              text,
  "signingKeyId"                  text,
  "allowedScopes"                 text,
  "customClaims"                  text,
  "dpopBoundAccessTokensRequired" integer DEFAULT 0,
  "disabled"                      integer DEFAULT 0,
  "createdAt"                     date,
  "updatedAt"                     date,
  "policyVersion"                 integer DEFAULT 1,
  "metadata"                      text
);

CREATE TABLE IF NOT EXISTS "oauthClientResource" (
  "id"         text NOT NULL PRIMARY KEY,
  "clientId"   text NOT NULL REFERENCES "oauthClient" ("clientId") ON DELETE CASCADE,
  "resourceId" text NOT NULL REFERENCES "oauthResource" ("identifier") ON DELETE CASCADE,
  "metadata"   text,
  "createdAt"  date
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauthClientResource_clientId_resourceId_uidx"
  ON "oauthClientResource" ("clientId", "resourceId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_clientId_idx"
  ON "oauthClientResource" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_resourceId_idx"
  ON "oauthClientResource" ("resourceId");

CREATE TABLE IF NOT EXISTS "oauthRefreshToken" (
  "id"                       text NOT NULL PRIMARY KEY,
  "token"                    text NOT NULL UNIQUE,
  "clientId"                 text NOT NULL REFERENCES "oauthClient" ("clientId") ON DELETE CASCADE,
  "sessionId"                text REFERENCES "session" ("id") ON DELETE SET NULL,
  "userId"                   text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "referenceId"              text,
  "authorizationCodeId"      text,
  "resources"                text,
  "requestedUserInfoClaims"  text,
  "expiresAt"                date NOT NULL,
  "createdAt"                date NOT NULL,
  "revoked"                  date,
  "rotatedAt"                date,
  "rotationReplayResponse"   text,
  "rotationReplayExpiresAt"  date,
  "authTime"                 date,
  "confirmation"             text,
  "scopes"                   text NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx"
  ON "oauthRefreshToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx"
  ON "oauthRefreshToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx"
  ON "oauthRefreshToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_authorizationCodeId_idx"
  ON "oauthRefreshToken" ("authorizationCodeId");

CREATE TABLE IF NOT EXISTS "oauthAccessToken" (
  "id"                       text NOT NULL PRIMARY KEY,
  "token"                    text NOT NULL UNIQUE,
  "clientId"                 text NOT NULL REFERENCES "oauthClient" ("clientId") ON DELETE CASCADE,
  "sessionId"                text REFERENCES "session" ("id") ON DELETE SET NULL,
  "userId"                   text REFERENCES "user" ("id") ON DELETE CASCADE,
  "referenceId"              text,
  "authorizationCodeId"      text,
  "resources"                text,
  "requestedUserInfoClaims"  text,
  "refreshId"                text REFERENCES "oauthRefreshToken" ("id") ON DELETE CASCADE,
  "expiresAt"                date NOT NULL,
  "createdAt"                date NOT NULL,
  "revoked"                  date,
  "confirmation"             text,
  "scopes"                   text NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx"
  ON "oauthAccessToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx"
  ON "oauthAccessToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx"
  ON "oauthAccessToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_authorizationCodeId_idx"
  ON "oauthAccessToken" ("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx"
  ON "oauthAccessToken" ("refreshId");

CREATE TABLE IF NOT EXISTS "oauthConsent" (
  "id"                      text NOT NULL PRIMARY KEY,
  "clientId"                text NOT NULL REFERENCES "oauthClient" ("clientId") ON DELETE CASCADE,
  "userId"                  text REFERENCES "user" ("id") ON DELETE CASCADE,
  "referenceId"             text,
  "resources"               text,
  "requestedUserInfoClaims" text,
  "scopes"                  text NOT NULL,
  "createdAt"               date NOT NULL,
  "updatedAt"               date NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx"
  ON "oauthConsent" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx"
  ON "oauthConsent" ("userId");

CREATE TABLE IF NOT EXISTS "oauthClientAssertion" (
  "id"        text NOT NULL PRIMARY KEY,
  "expiresAt" date NOT NULL
);
