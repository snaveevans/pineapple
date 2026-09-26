/**
 * Minimal Wrangler entrypoint for getPlatformProxy's binding-only operator session.
 * The recovery CLI never invokes fetch, and this config is not used for deployment.
 */
export default {
  fetch(): Response {
    return new Response("Operator bindings only.", { status: 404 });
  },
};
