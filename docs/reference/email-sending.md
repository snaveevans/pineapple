# Email Sending (transactional)

> **Audience:** operators & developers · **Decision:** [ADR-0012](../decisions/0012-transactional-email-via-cloudflare-email-sending.md)

Pineapple sends transactional email (contact-email verification links, and
future maintenance reminders) through **Cloudflare Email Sending**. Sending sits
behind the application `TransactionalEmailSender` port; the Cloudflare adapter is
`apps/api/src/infrastructure/email/CloudflareEmailSender.ts`.

## Worker binding & config

`apps/api/wrangler.jsonc` declares:

- `"send_email": [{ "name": "EMAIL" }]` — the Worker binding used to send.
- `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` vars — the sender identity. The
  address's domain must be onboarded (below).

At runtime `worker.ts` builds a `CloudflareEmailSender` only when both `EMAIL`
and `EMAIL_FROM_ADDRESS` are present; otherwise it falls back to a no-op sender
so token issuance, rate limiting, and audit still run locally without delivering
mail. Verification token issuance never depends on the send succeeding — a send
failure is recorded (retryable vs permanent) and the user can resend.

## One-time domain onboarding

The `from` domain must be onboarded to Email Sending before the first send:

```bash
npx wrangler email sending enable pineapple.tylerevans.co
# list onboarded domains:
npx wrangler email sending list
```

Onboarding auto-provisions the DNS authentication records in the Cloudflare zone.

## Required DNS authentication (SPF / DKIM / DMARC)

- **SPF** — a TXT record authorizing Cloudflare's sending infrastructure.
  Auto-configured during domain onboarding.
- **DKIM** — signing records for outbound mail. Auto-configured during
  onboarding.
- **DMARC** — **add manually** if the domain has none. A reasonable starting
  policy:

  ```
  _dmarc.pineapple.tylerevans.co  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@tylerevans.co"
  ```

Cloudflare additionally manages IP reputation, soft-bounce retries, hard-bounce
suppression, and complaint feedback loops. See the
[deliverability docs](https://developers.cloudflare.com/email-service/concepts/deliverability/).

## Local development

`wrangler dev` binds `EMAIL` but does not deliver unless the binding is marked
`remote = true`. Without that, or without `EMAIL_FROM_ADDRESS`, the no-op sender
is used. To exercise real delivery locally, add `remote = true` to the
`[[send_email]]` binding and send to an address you control.

## Send outcomes

`CloudflareEmailSender` maps the binding's `E_*` error codes to a `failed`
result with a `retryable` flag: rate-limit, daily-limit, delivery, and internal
errors are retryable; validation, sender-not-verified, and suppressed-recipient
errors are permanent. The adapter never throws to its caller.
