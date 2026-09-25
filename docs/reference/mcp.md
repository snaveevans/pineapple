> **Audience:** Pineapple operators and integration testers · **Purpose:** release, privately connect, verify, and recover the ChatGPT asset-query integration · **Source of truth:** this checklist, [the feature spec](../specs/features/chatgpt-asset-access.md), and [the production rollback runbook](../runbooks/rollback.md) · **Last reviewed:** 2026-09-25

# Private ChatGPT asset-query release plan

## Outcome and boundaries

Pineapple exposes one private, read-only MCP tool at:

```text
https://pineapple.txe.app/mcp
```

`list_assets` returns the authenticated user's active owned and team-shared
assets. It accepts no arguments, cannot select another user, and cannot change
an asset. Vehicle and equipment details are included; property names and
addresses are excluded from both structured and readable tool results. The
existing REST/OpenAPI contract is unchanged.

The ChatGPT connection is **personal and unpublished**, not a public directory
listing. The MCP URL itself is publicly reachable over HTTPS so ChatGPT can
connect, but Pineapple requires OAuth and enforces asset authorization on every
call. Reports, scheduled jobs, write tools, and public publication are outside
this release.

The release has two ordered slices: OAuth/MCP transport (`S1`,
[PR #291](https://github.com/snaveevans/pineapple/pull/291)), then the single
asset tool (`S2`). Each needs its own green PR and explicit human merge
approval. Do not connect ChatGPT until both production deployments pass their
gates. This document does not itself authorize merging or connecting.

## Current ChatGPT availability

The owner's Pro account can reach the developer-mode **Create MCP App** flow on
ChatGPT web. OpenAI's [developer-mode guide](https://developers.openai.com/api/docs/guides/developer-mode)
also lists Plus eligibility on the web, but that does not establish mobile
access. OpenAI's [plugin availability guide](https://learn.chatgpt.com/docs/plugins)
says plugins available to an account can run on mobile, while **Desktop only**
plugins cannot. A separate Pineapple package made through Plugin Creator was
marked Desktop only and its Chat action was disabled in this account. The
private **Pineapple Assets (persistent)** connection is installed and works on
ChatGPT web, but has not been tested in the phone app. Do not treat a successful
web connection or absence of a Desktop-only label on the web as mobile
verification, and do not publish it to work around a surface limitation.

## Release record — fill in before each merge

Keep this in release/incident notes, without tokens or private asset data.
Record the **deployed** version, not merely the latest uploaded version. From
`apps/api` and `apps/web`, respectively, `pnpm wrangler deployments list` and
`pnpm wrangler versions list` show deployment history and version IDs. The
Cloudflare Workers & Pages dashboard shows the same history.

| Checkpoint         | Record                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pre-MCP API Worker | `99d1220e-dae1-4d8f-b52e-fe414229d647` · 2026-09-21 03:30 UTC                                                                                                                                                                                          |
| Pre-MCP web Worker | `8e271734-894e-4f47-b95c-db489ffaf198` · 2026-09-21 03:30 UTC                                                                                                                                                                                          |
| S1 merge commit    | `c4f79ca99eee5e2d55333134c6f36aafa351e74d`                                                                                                                                                                                                             |
| S1 API Worker      | `a1f40db8-3130-4924-a0ce-04ea381c8234` · 2026-09-25 05:36 UTC                                                                                                                                                                                          |
| S1 web Worker      | `04de1713-65c1-4d09-8ee1-e2d24a7f1609` · 2026-09-25 05:36 UTC                                                                                                                                                                                          |
| S1 verification    | [Deploy](https://github.com/snaveevans/pineapple/actions/runs/36099155673) green; production smoke passed                                                                                                                                              |
| S2 merge commit    | `f6c34608d6a0aabcc45a5da9b6e8400af5ac00a0`                                                                                                                                                                                                             |
| S2 API Worker      | `be4f93f0-ba69-477b-8455-30ca464fcf3c` · 2026-09-25 06:07 UTC                                                                                                                                                                                          |
| S2 verification    | [Deploy](https://github.com/snaveevans/pineapple/actions/runs/36101315541) green; production smoke passed; owner approved read-only `assets:read offline_access`; authenticated ChatGPT web calls and post-expiry refresh passed; mobile check pending |

`S2` production smoke covered `/health`, `/openapi.json`, OAuth discovery, an
unauthenticated `/mcp` challenge, and the signed-in Asset Library. On 2026-09-25,
ChatGPT web discovered exactly one no-input, read-only `list_assets` tool.
Explicit and natural-language prompts both invoked Pineapple Assets and returned
the active authorized inventory with category counts matching the Asset Library.
An out-of-scope prompt found no write tool and did not expose archived or
unshared assets. A fresh tool call led ChatGPT to report that both result
representations contain only `kind` under property metadata and no property
name or address fields. The ChatGPT UI did not expose the raw tool payload for
independent inspection; the server's protocol tests assert this redaction in
both representations.

The first private ChatGPT app requested only `assets:read`. After its
five-minute access token expired, ChatGPT requested Reconnect. Reconnection
succeeded using the existing consent, but production OAuth records confirmed
that no refresh token had been issued. The owner then approved a separate,
private **Pineapple Assets (persistent)** connection requesting
`assets:read offline_access`. Its consent screen described active-asset read
access and staying connected, with no write access. ChatGPT's first query
returned the expected category counts; a second query after access-token
expiry returned the same counts without a reconnect prompt. Read-only
production OAuth diagnostics showed one active refresh token created at
15:27:51 UTC and a new active token created at 15:33:52 UTC, with the earlier
token rotated. This verifies automatic refresh; it does not guarantee future
connectivity beyond the current refresh-token lifetime (30 days under the
server default). The original personal connection remains in place pending
owner choice about disconnecting it. No Worker rollback was warranted: the
backend and authorization/privacy checks remained healthy. Mobile use remains
unverified.

Use these exact version IDs in a rollback. An unqualified `wrangler rollback`
selects the version uploaded before the latest one, which may not be the
intended known-good release. See [Cloudflare's Wrangler reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
These pre-MCP IDs were verified against Cloudflare's deployment history on
2026-09-24; the API ID also matched live `/health.version`.

## 1. Prepare locally

1. Confirm `S1` is a single concern, green, and ready for human review. Confirm
   `S2` is based on the landed `S1` tip before it is merged. Do not merge them
   together or skip the deployment gate between them.
2. Run `pnpm verify` on each finished branch. It covers lint, type-check,
   tests, and generated-artifact drift. Keep the MCP privacy, auth, and
   visibility tests in the evidence packet.
3. Apply all migrations to a **local** D1 database with
   `pnpm --filter @snaveevans/pineapple-api exec wrangler d1 migrations apply pineapple --local`.
   Do not use `--remote` for this local check. In separate terminals, start the
   API Worker and Vite web app:

   ```bash
   pnpm --filter @snaveevans/pineapple-api exec wrangler dev --var ENVIRONMENT:development --var BETTER_AUTH_URL:http://localhost:5173 --inspector-port 9230
   pnpm --filter @snaveevans/pineapple-web dev
   ```

   The Worker uses port `8787` and Vite proxies `/api`, `/mcp`, and
   `/.well-known` from `http://localhost:5173` to that port. Check
   `http://localhost:8787/health` for an accessible database and migration
   `0023_mcp_oauth_provider.sql`. Keep `BETTER_AUTH_URL` at the Vite origin so
   OAuth callbacks, `/login`, and `/oauth/consent` share one browser origin.
   Local OAuth requires Google credentials in an uncommitted
   `apps/api/.dev.vars`; never commit those secrets. Without
   `BETTER_AUTH_URL`, `/mcp` cannot produce its OAuth challenge locally.

4. Check the local protected-resource and authorization-server discovery
   documents through `http://localhost:5173`. An unauthenticated `POST /mcp`
   must return `401` with a `WWW-Authenticate` challenge; a browser cookie
   alone must not authorize it.
   An authorized test call must advertise only `list_assets`, and its raw
   structured and readable results must omit every property address field and
   the free-form property name. Use representative local/test assets, not
   production data copied into a test log.
5. Establish a production baseline: `/health`, `/openapi.json`, Google sign-in,
   the web Asset Library, and an existing authenticated asset request. Record
   the pre-MCP API and web Worker version IDs above.

The local checks do not prove ChatGPT's hosted OAuth handshake or mobile
availability; those are separate release gates below.

## 2. Deploy and verify `S1` — auth and transport

1. After explicit approval, merge the green `S1` PR. The `main` deploy workflow
   re-verifies the repository, applies the additive OAuth migration
   `0023_mcp_oauth_provider.sql` to production D1 **before** deploying the API
   Worker, deploys affected Workers, and smoke-checks API `/health` and
   `/openapi.json`. `S1` also changes the web consent/login flow, so expect
   both API and web deploy jobs. Wait for both jobs to finish.
2. Check `/health` on the production host: status `ok`, database `reachable`,
   and the expected latest migration. Check `/openapi.json`, normal
   Google sign-in, the web Asset Library, and an existing authenticated asset
   request. Existing behavior must remain intact.
3. Check the OAuth discovery documents and an unauthenticated `POST /mcp` on
   `https://pineapple.txe.app`. The metadata must identify the canonical MCP
   resource and Pineapple authorization server; `/mcp` must challenge with
   `401`, not return asset data. `S1` should not yet expose the asset tool.
4. Record the deployed `S1` API and web Worker versions. If any gate fails,
   **stop**: do not merge `S2` or start ChatGPT setup. Follow the rollback
   decision table below.

The workflow's smoke check does not test sign-in, the MCP handshake, or privacy.
Those manual checks are required even when GitHub Actions is green.

Minimal read-only HTTP probes for the canonical production host (inspect the
last response headers for `401` and `WWW-Authenticate`):

```bash
curl -fsS https://pineapple.txe.app/health | jq -e '.status == "ok" and .database == "reachable"'
curl -fsS https://pineapple.txe.app/openapi.json | jq -e 'has("openapi") and has("paths")'
curl -fsS https://pineapple.txe.app/.well-known/oauth-protected-resource/mcp | jq -e '.resource == "https://pineapple.txe.app/mcp"'
curl -fsS https://pineapple.txe.app/.well-known/oauth-authorization-server/api/auth | jq -e 'has("authorization_endpoint") and has("token_endpoint")'
curl -si -X POST https://pineapple.txe.app/mcp -H 'Content-Type: application/json' --data '{}'
```

## 3. Deploy and verify `S2` — one asset query

1. Rebase/update `S2` onto landed `S1`, run `pnpm verify`, complete its PR
   review, and obtain explicit human merge approval. Merge only after `S1` is
   confirmed healthy in production.
2. Wait for the `main` deploy workflow to finish. `S2` should deploy the API
   Worker; confirm the actual jobs rather than assuming the path filter's
   outcome. Check `/health`, `/openapi.json`, normal sign-in, and the web Asset
   Library again. Record the deployed `S2` API Worker version.
3. Before attaching personal ChatGPT data, use a controlled authenticated MCP
   test account or safe representative inventory to inspect the **raw** tool
   declaration and both result representations. There must be exactly one
   application tool, `list_assets`, with no input fields and read-only
   annotations. It must return active owned and team-shared assets, exclude
   archived/unshared/foreign assets, and match the Asset Library's category
   counts. Property results contain only `kind` metadata, not the free-form
   name, nickname, address object, or street/city/state/postal-code/country values. Attempted
   write actions must have no Pineapple tool to call.
4. If this gate fails, do not connect ChatGPT. A wrong-user asset or address
   leak is a security/privacy incident and requires the full MCP shutdown in
   the rollback table, not only a tool-description refresh.

## 4. Create the private ChatGPT connection

OpenAI's current [connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)
describes connecting a remote MCP server in ChatGPT web developer mode. Complete
this step only after both deployments pass.

1. In ChatGPT web, open **Settings → Security and login** and enable
   **Developer mode**. Open **ChatGPT Plugins → Add plugin → Create app → Create
   MCP App**. Name it **Pineapple Assets** (or another clear personal name), use
   `https://pineapple.txe.app/mcp` as the Server URL, and keep it personal and
   unpublished. Select **OAuth**, not No Auth.
2. Review Advanced OAuth settings before creating it. Pineapple discovery
   should select **Dynamic Client Registration (DCR)**, request the default
   scope `assets:read` and the base scope `offline_access`, and show Pineapple
   `/api/auth` authorization, token, and registration endpoints. Without
   `offline_access`, Pineapple issues no refresh token and ChatGPT prompts to
   reconnect after the five-minute access token expires. Acknowledge the custom
   server warning only for the Pineapple endpoint you control. Select
   **Create**; ChatGPT should register a client and open Pineapple consent.
3. At the live consent screen, confirm it names the requesting client and
   grants only active-asset read access and permission to stay connected; it
   must not offer asset write access. Property redaction must be verified from
   the tool result and server tests, not inferred from the consent text. The
   account owner decides whether to select **Allow access**; cancel if the
   displayed client or scope is unexpected. Client names are self-reported by
   the requesting app, so a "ChatGPT" label alone does not prove origin; approve
   only the flow you just initiated in ChatGPT. The consent URL expires. In the
   observed account, ChatGPT saves **Pineapple Assets** before consent, but
   shows no connected account or app tools yet. If the URL times out, open the
   saved app's **Manage → Connected accounts → Connect another account** control
   to retry authorization before creating a duplicate app. Never copy an
   authorization code or URL into another service.
4. After owner approval, confirm discovery shows exactly one tool,
   `list_assets`. In a new web conversation, choose **Developer mode** from the
   composer plus menu and select Pineapple Assets before asking for the asset
   list. Do not substitute a Plugin Creator package marked **Desktop only**;
   that separate surface did not enable Chat on this account.

No API key, Pineapple cookie, client secret, or manually invented OAuth client
ID should be entered. If ChatGPT asks for one, stop and diagnose registration;
do not work around OAuth by pasting a secret. Do not publish the plugin or add
it to a shared marketplace.

## 5. Verify in ChatGPT web, then on the phone

Use an account with a known inventory and compare to the live Pineapple Asset
Library. Inspect the tool-call details or raw MCP result where available, not
only ChatGPT's prose answer. Do not paste the full private result into a PR,
issue, or telemetry log.

1. Explicit prompt: `@Pineapple Assets List all of my Pineapple assets.` It should
   call only `list_assets` and return the user's active owned and team-shared
   vehicles, equipment, and properties with correct counts.
2. Natural prompt with Pineapple enabled: “What vehicles, equipment, and
   properties do I have?” It should select the same tool and return the same
   authorized inventory.
3. Negative prompts: ask for an archived or another user's unshared asset,
   then ask Pineapple to create, edit, or archive an asset. The first must not
   reveal an unauthorized asset; the second must find no write tool. Verify
   asset state is unchanged.
4. Privacy: confirm the raw structured result **and** readable content have
   no property free-form name or nickname, `address` object, or street/city/state/
   postal-code/country components. A friendly summary omitting an address is
   insufficient evidence if the tool payload still contains it.
5. After the five-minute access token expires, run the read-only query again.
   It should succeed without **Reconnect**. Verify on Pineapple that an active
   OAuth refresh token was rotated and replaced; do not inspect or log token
   values. A successful response alone could be cached and does not prove
   refresh. The server default refresh-token lifetime is 30 days, so this
   short test does not establish indefinite connectivity.
6. Check ChatGPT mobile with the same account. OpenAI documents mobile use for
   plugins available to that account, but the separate Plugin Creator package
   was marked Desktop only and the private MCP connection's mobile availability
   has not been verified. In a new phone chat, look for **Pineapple Assets
   (persistent)** and, if available, ask it to list your active Pineapple
   assets. Confirm it calls `list_assets`, matches the web inventory, and omits
   property names and addresses. Record a successful tool call as mobile
   evidence. If the connection is absent or the call fails, record that
   account/surface failure and leave the accepted mobile outcome **unmet**. Do
   not weaken Pineapple's authorization or privacy boundary to make it appear
   to work.

Record pass/fail and links to non-sensitive CI/deploy evidence. Refresh the
ChatGPT connection metadata after any later tool-name, description, schema,
auth, or annotation change, then rerun the relevant prompts. See [OpenAI's
connection-testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## 6. Rollback and recovery

Do not wait for an automatic rollback: the deploy workflow fails red and points
to the [general rollback runbook](../runbooks/rollback.md), but does not itself
revert a Worker. Preserve the failed job output and identify which slice is
live. Roll back the **specific recorded version**, then verify normal app
behavior before investigating. See [Cloudflare rollback guidance](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

| Failure                                                                           | Immediate target                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Verify fails before deployment                                                    | Stop and fix the PR; production is unchanged.                                                                            |
| Migration applies but `S1` deploy/smoke fails                                     | Stop. If a new Worker is live and unhealthy, restore the affected pre-MCP API/web version.                               |
| Existing sign-in, REST assets, or SPA regresses after `S1`                        | Restore the affected pre-MCP API/web version; restore both if the OAuth/login interaction spans them. Do not merge `S2`. |
| `S2` tool fails but authorization and privacy remain sound                        | Restore the healthy `S1` API version; it has no `list_assets` tool.                                                      |
| Wrong-user assets or a property address reaches MCP/ChatGPT                       | Privacy incident: restore the pre-MCP API version immediately; restore the pre-MCP web version if needed.                |
| Only ChatGPT setup, plan, or mobile availability fails while Pineapple is healthy | Disconnect/remove the personal connection; no Worker rollback unless a server defect is found.                           |

For a privacy incident, stop testing, disconnect the personal connection,
preserve evidence securely, and assess what data may already have reached
ChatGPT. The recorded pre-MCP API version is the full MCP kill switch. A red
deployment or smoke check is a stop signal, not permission to proceed to the
next slice. Leave the additive D1 migration in place.

For an emergency Worker rollback, start from the repository root and use the
**actual** version ID from the release record, not these placeholders:

```bash
cd apps/api
pnpm wrangler deployments list
pnpm wrangler rollback <RECORDED_API_VERSION_ID>

# Only if the web Worker also needs restoring:
cd ../web
pnpm wrangler deployments list
pnpm wrangler rollback <RECORDED_WEB_VERSION_ID>
```

Wrangler prompts for a rollback reason; write a clear incident reason. The
Cloudflare dashboard offers the same operation under **Workers & Pages →
Worker → Deployments → Rollback**. A rollback can be blocked if connected
platform resources/bindings changed incompatibly; in that case use a reviewed
source revert/fix-forward through the normal pipeline and escalate the
incident. See [Cloudflare rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

On the release operator's machine, an inactive `CLOUDFLARE_API_TOKEN` may
override a valid Wrangler browser login and produce authentication error
`10000`. If that happens, run the same command with
`env -u CLOUDFLARE_API_TOKEN` in front, or use the signed-in Cloudflare
dashboard. Never copy the token into release notes.

After an emergency runtime rollback, submit a GitHub revert/correction PR and
obtain normal merge approval, or the next deploy from `main` can reintroduce
the bad version. If both slices have landed, revert `S2` before `S1`. Verify
`/health`, `/openapi.json`, normal sign-in, the Asset Library, and that the
unwanted MCP tool is unavailable. Record the restored Worker version(s) and
incident link.

**Do not drop the OAuth tables or restore all of D1 as a code rollback.**
Migration `0023_mcp_oauth_provider.sql` only adds tables/indexes and remains
compatible with pre-MCP code. D1 migrations run before Worker deployment and
are not undone by Worker rollback. A database restore is a separate,
data-destructive incident decision. See [Pineapple's schema-migration rule](../specs/cross-cutting/schema-migrations.md)
and [Cloudflare D1 migration behavior](https://developers.cloudflare.com/d1/wrangler-commands/).

Disconnecting or uninstalling in ChatGPT is not proof that Pineapple's OAuth
grant or already-issued token has been revoked. A Pineapple MCP access token
is self-contained and expires within five minutes; a Worker rollback to the
pre-MCP version closes the MCP service immediately. A response already
delivered to ChatGPT cannot be retracted by rollback. If credentials or
private data may have been exposed, handle grant revocation and
conversation/data exposure as incident follow-up rather than assuming the
disconnect erased them.
