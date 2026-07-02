import type {
  EmailDeliveryResult,
  TransactionalEmail,
  TransactionalEmailSender,
} from "../../application/ports/TransactionalEmailSender.ts";

/**
 * Structural view of the Cloudflare Email Sending Worker binding (`send_email`).
 * Declared locally so the application/infra boundary owns the provider shape
 * rather than depending on generated global types.
 */
export interface CloudflareSendEmailBinding {
  send(message: {
    to: string | string[];
    from: { email: string; name?: string };
    replyTo?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

/**
 * Cloudflare Email Sending adapter behind the {@link TransactionalEmailSender}
 * port (ADR-0012). The `from` address must be on a domain onboarded via
 * `wrangler email sending enable <domain>` — see docs/reference/email-sending.md.
 *
 * Send errors are never thrown to the caller: they are mapped to a `failed`
 * result with a `retryable` flag derived from the binding's `E_*` error code, so
 * durable callers can decide whether to re-enqueue.
 */
export class CloudflareEmailSender implements TransactionalEmailSender {
  constructor(
    private readonly binding: CloudflareSendEmailBinding,
    private readonly from: { email: string; name?: string },
  ) {}

  async send(email: TransactionalEmail): Promise<EmailDeliveryResult> {
    try {
      await this.binding.send({
        to: email.to.address,
        from: this.from,
        subject: email.subject,
        text: email.text,
        ...(email.html !== undefined ? { html: email.html } : {}),
      });
      return { status: "sent" };
    } catch (error) {
      const reason = errorCode(error);
      return { status: "failed", retryable: RETRYABLE_CODES.has(reason), reason };
    }
  }
}

/** Codes the binding surfaces for transient failures worth retrying. */
const RETRYABLE_CODES = new Set([
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
  "E_DELIVERY_FAILED",
  "E_INTERNAL_SERVER_ERROR",
]);

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    if (typeof code === "string" && code.length > 0) return code;
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "unknown";
}
