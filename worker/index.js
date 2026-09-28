// G. worker: serves the game from this repo's root (the ASSETS binding) and takes the opt-in playtest
// telemetry at /api/telemetry/*. "/" opens play.html. The studio, tests and tools stay off the site
// (.assetsignore). Deployed with wrangler.jsonc at the repo root.
import { handleTelemetry } from "./telemetry.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/telemetry/")) return handleTelemetry(request, env, url);
    if (url.pathname === "/api/health") {
      const meta = env.CF_VERSION_METADATA || {};
      return new Response(JSON.stringify({ ok: true, version: meta.id || null, tag: meta.tag || null }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (!env.ASSETS) return new Response("no assets binding", { status: 500 });
    if (url.pathname === "/") return env.ASSETS.fetch(new Request(new URL("/play.html", url), request));
    return env.ASSETS.fetch(request);
  }
};
