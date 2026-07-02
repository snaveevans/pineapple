import type { Email } from "@snaveevans/pineapple-shared";

/**
 * A recipient of a transactional email. `address` is the branded, normalized
 * contact email; `name` is an optional display name.
 */
export interface EmailRecipient {
  address: Email;
  name?: string;
}

/**
 * A provider-agnostic transactional email. Callers render the subject and body
 * (verification-link copy or aggregated reminder copy); the port only puts the
 * message on the wire. Keeping this free of provider-specific fields is what
 * lets the concrete adapter be swapped per
 * [ADR-0012](../../../docs/decisions/0012-transactional-email-via-cloudflare-email-sending.md).
 */
export interface TransactionalEmail {
  to: EmailRecipient;
  subject: string;
  /** Required plain-text body. */
  text: string;
  /** Optional HTML body; adapters fall back to `text` when omitted. */
  html?: string;
}

/**
 * The outcome of a send attempt. `retryable` on a failure tells durable callers
 * (the outbound reminder consumer) whether re-enqueueing could succeed later or
 * whether the failure is permanent and should be recorded as `failed`.
 */
export type EmailDeliveryResult =
  | { readonly status: "sent" }
  | { readonly status: "failed"; readonly retryable: boolean; readonly reason: string };

/**
 * Port: puts a transactional email on the wire. Used for both verification
 * emails (email-verification) and aggregated reminder emails (notifications).
 * The Cloudflare Email Sending adapter lives in infrastructure/.
 */
export interface TransactionalEmailSender {
  send(email: TransactionalEmail): Promise<EmailDeliveryResult>;
}
