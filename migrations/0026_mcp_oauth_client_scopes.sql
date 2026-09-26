-- Expand only the prior public-web MCP registration capability whitelist.
-- This is not user consent: oauthConsent and issued/refresh token scopes remain
-- untouched. Better Auth must obtain renewed consent before granting new scopes.
-- Public clients use the provider's enforced PKCE default when requirePKCE is NULL.
UPDATE "oauthClient"
SET "scopes" = '["assets:read","maintenance:read","assets:write","maintenance:write","offline_access"]'
WHERE "tokenEndpointAuthMethod" = 'none'
  AND "clientSecret" IS NULL
  AND "userId" IS NULL
  AND "applicationType" = 'web'
  AND COALESCE("disabled", 0) = 0
  AND COALESCE("skipConsent", 0) = 0
  AND ("requirePKCE" IS NULL OR "requirePKCE" = 1)
  AND json_type(CASE WHEN json_valid("scopes") THEN "scopes" ELSE '[]' END) = 'array'
  AND json_type(CASE WHEN json_valid("grantTypes") THEN "grantTypes" ELSE '[]' END) = 'array'
  AND json_array_length(CASE WHEN json_valid("scopes") THEN "scopes" ELSE '[]' END) = 2
  AND EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid("scopes") THEN "scopes" ELSE '[]' END)
    WHERE value = 'assets:read'
  )
  AND EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid("scopes") THEN "scopes" ELSE '[]' END)
    WHERE value = 'offline_access'
  )
  AND EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid("grantTypes") THEN "grantTypes" ELSE '[]' END)
    WHERE value = 'authorization_code'
  )
  AND NOT EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid("grantTypes") THEN "grantTypes" ELSE '[]' END)
    WHERE type <> 'text' OR value NOT IN ('authorization_code', 'refresh_token')
  );
