import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createMutatingRequestOutboxRelayMiddleware } from "./mutatingRequestOutboxRelay.ts";

function buildApp(getRelayPromises: () => Promise<unknown>[]) {
  const app = new Hono();
  app.use("*", createMutatingRequestOutboxRelayMiddleware(getRelayPromises));
  app.post("/mutate", (c) => c.json({ ok: true }, 201));
  app.post("/fails", (c) => c.json({ ok: false }, 422));
  app.get("/read", (c) => c.json({ ok: true }, 200));
  return app;
}

function fakeExecutionContext() {
  const waited: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => waited.push(promise),
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  return { ctx, waited };
}

describe("createMutatingRequestOutboxRelayMiddleware", () => {
  it("relays every outbox after a successful mutating request", async () => {
    let relaysBuilt = 0;
    const app = buildApp(() => {
      relaysBuilt++;
      return [Promise.resolve("activity"), Promise.resolve("notification")];
    });
    const { ctx, waited } = fakeExecutionContext();

    const res = await app.fetch(
      new Request("http://localhost/mutate", { method: "POST" }),
      {},
      ctx,
    );

    expect(res.status).toBe(201);
    expect(relaysBuilt).toBe(1);
    expect(waited).toHaveLength(2);
    await expect(Promise.all(waited)).resolves.toEqual(["activity", "notification"]);
  });

  it("does not relay when the mutating request fails", async () => {
    let relaysBuilt = 0;
    const app = buildApp(() => {
      relaysBuilt++;
      return [Promise.resolve()];
    });
    const { ctx, waited } = fakeExecutionContext();

    const res = await app.fetch(new Request("http://localhost/fails", { method: "POST" }), {}, ctx);

    expect(res.status).toBe(422);
    expect(relaysBuilt).toBe(0);
    expect(waited).toHaveLength(0);
  });

  it("does not relay for a non-mutating (GET) request", async () => {
    let relaysBuilt = 0;
    const app = buildApp(() => {
      relaysBuilt++;
      return [Promise.resolve()];
    });
    const { ctx, waited } = fakeExecutionContext();

    const res = await app.fetch(new Request("http://localhost/read"), {}, ctx);

    expect(res.status).toBe(200);
    expect(relaysBuilt).toBe(0);
    expect(waited).toHaveLength(0);
  });
});
