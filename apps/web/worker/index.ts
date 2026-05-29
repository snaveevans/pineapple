// Worker entry for the marketing site. Static assets (the built SPA) are
// served by the runtime ahead of this handler; only unmatched paths reach
// here. Reserve /api/* for future server routes; everything else is handled
// by the SPA asset fallback (wrangler.jsonc -> assets.not_found_handling).
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ name: "pineapple-web" });
    }
    return new Response(null, { status: 404 });
  },
};
