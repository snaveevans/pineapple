import { Email } from "@snaveevans/pineapple-shared";
import { describe, expect, it } from "vitest";
import type { TransactionalEmail } from "../../application/ports/TransactionalEmailSender.ts";
import { CloudflareEmailSender, type CloudflareSendEmailBinding } from "./CloudflareEmailSender.ts";

type SentMessage = Parameters<CloudflareSendEmailBinding["send"]>[0];

class BindingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class BindingFake implements CloudflareSendEmailBinding {
  readonly sent: SentMessage[] = [];
  constructor(private errorCode?: string) {}
  send(message: SentMessage): Promise<unknown> {
    if (this.errorCode) return Promise.reject(new BindingError(this.errorCode));
    this.sent.push(message);
    return Promise.resolve({ messageId: "abc" });
  }
}

const from = { email: "noreply@example.com", name: "Pineapple" };

const message: TransactionalEmail = {
  to: { address: Email.from("contact@example.com"), name: "Dale" },
  subject: "Verify your email",
  text: "Open the link.",
  html: "<p>Open the link.</p>",
};

describe("CloudflareEmailSender", () => {
  it("maps the message onto the binding and reports sent", async () => {
    const binding = new BindingFake();

    const result = await new CloudflareEmailSender(binding, from).send(message);

    expect(result).toEqual({ status: "sent" });
    expect(binding.sent).toHaveLength(1);
    expect(binding.sent[0]).toMatchObject({
      to: "contact@example.com",
      from,
      subject: "Verify your email",
      text: "Open the link.",
      html: "<p>Open the link.</p>",
    });
  });

  it("omits html when the message has none", async () => {
    const binding = new BindingFake();

    await new CloudflareEmailSender(binding, from).send({
      to: { address: Email.from("contact@example.com") },
      subject: "Plain",
      text: "text only",
    });

    expect(binding.sent[0]).not.toHaveProperty("html");
  });

  it("classifies a rate-limit error as a retryable failure", async () => {
    const binding = new BindingFake("E_RATE_LIMIT_EXCEEDED");

    const result = await new CloudflareEmailSender(binding, from).send(message);

    expect(result).toEqual({
      status: "failed",
      retryable: true,
      reason: "E_RATE_LIMIT_EXCEEDED",
    });
  });

  it("classifies a suppressed recipient as a permanent failure", async () => {
    const binding = new BindingFake("E_RECIPIENT_SUPPRESSED");

    const result = await new CloudflareEmailSender(binding, from).send(message);

    expect(result).toEqual({
      status: "failed",
      retryable: false,
      reason: "E_RECIPIENT_SUPPRESSED",
    });
  });
});
