import { Email } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type {
  EmailDeliveryResult,
  TransactionalEmail,
  TransactionalEmailSender,
} from "./TransactionalEmailSender.ts";

/**
 * In-memory fake exercising the port contract. It records every message it is
 * asked to send and returns a configurable outcome, so use-case tests for
 * verification and reminder sending can assert both the recorded email and how
 * they react to `sent` / retryable+permanent `failed` results.
 */
class TransactionalEmailSenderFake implements TransactionalEmailSender {
  readonly sent: TransactionalEmail[] = [];

  constructor(private result: EmailDeliveryResult = { status: "sent" }) {}

  send(email: TransactionalEmail): Promise<EmailDeliveryResult> {
    this.sent.push(email);
    return Promise.resolve(this.result);
  }
}

const message: TransactionalEmail = {
  to: { address: Email.from("contact@example.com"), name: "Dale" },
  subject: "Verify your email",
  text: "Open the link to verify.",
};

describe("TransactionalEmailSender contract", () => {
  it("records the message and reports a successful send", async () => {
    const sender = new TransactionalEmailSenderFake();

    const result = await sender.send(message);

    expect(result).toEqual({ status: "sent" });
    expect(sender.sent).toEqual([message]);
  });

  it("surfaces a permanent failure with a reason", async () => {
    const sender = new TransactionalEmailSenderFake({
      status: "failed",
      retryable: false,
      reason: "recipient rejected",
    });

    const result = await sender.send(message);

    expect(result).toEqual({ status: "failed", retryable: false, reason: "recipient rejected" });
  });

  it("distinguishes a retryable failure", async () => {
    const sender = new TransactionalEmailSenderFake({
      status: "failed",
      retryable: true,
      reason: "temporary provider outage",
    });

    const result = await sender.send(message);

    expect(result.status === "failed" && result.retryable).toBe(true);
  });
});
