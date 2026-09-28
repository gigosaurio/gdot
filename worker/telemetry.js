// telemetry.js — opt-in playtest data for G., backed by the TELEMETRY D1 binding.
//
//   POST /api/telemetry/ingest   {playerId, games:[event,...]} | bare event | array of either
//   GET  /api/telemetry/export?key=...&since=<id>   rows for local analysis
//   GET  /api/telemetry/health   {ok}
//
// No accounts, no personal data: a random player id, which tank, what happened. Export is gated by the
// TELEMETRY_KEY secret (npx wrangler secret put TELEMETRY_KEY). Same shape as the gigomakes worker's,
// without its KV rate limiter: writes are capped by size and count per request instead.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
const MAX_BODY_BYTES = 256 * 1024, MAX_GAMES_PER_REQUEST = 25, EXPORT_PAGE_SIZE = 500;

function flatten(input) {
  const out = [];
  const visit = (node, pid) => {
    if (node == null || typeof node !== "object" || out.length >= MAX_GAMES_PER_REQUEST) return;
    if (Array.isArray(node)) { node.forEach(n => visit(n, pid)); return; }
    if (Array.isArray(node.games)) { node.games.forEach(g => visit(g, node.playerId || pid)); return; }
    if (node.levelId !== undefined) out.push({ playerId: node.playerId || pid || null, ...node });
  };
  visit(input, null); return out;
}
async function ingest(request, env) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return json({ ok: false, error: "payload too large" }, 413);
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: "body must be JSON" }, 400); }
  const stats = flatten(body); if (!stats.length) return json({ ok: false, error: "no events in payload" }, 400);
  const now = new Date().toISOString();
  const stmt = env.TELEMETRY.prepare("INSERT INTO games (received_at, player_id, level_id, game_complete, duration_sec, payload) VALUES (?, ?, ?, ?, ?, ?)");
  await env.TELEMETRY.batch(stats.map(s => stmt.bind(now, s.playerId == null ? null : String(s.playerId), s.levelId == null ? null : String(s.levelId),
    s.event === "clear" ? 1 : s.event === "death" ? 0 : null, typeof s.duration === "number" ? s.duration : null, JSON.stringify(s).slice(0, 8000))));
  return json({ ok: true, stored: stats.length });
}
async function exportRows(env, url) {
  const key = url.searchParams.get("key");
  if (!env.TELEMETRY_KEY) return json({ ok: false, error: "TELEMETRY_KEY not configured" }, 403);
  if (key !== env.TELEMETRY_KEY) return json({ ok: false, error: "bad key" }, 403);
  const since = Number(url.searchParams.get("since") || 0);
  const { results } = await env.TELEMETRY.prepare("SELECT id, received_at, player_id, level_id, payload FROM games WHERE id > ? ORDER BY id LIMIT ?").bind(since, EXPORT_PAGE_SIZE).all();
  const rows = results.map(r => ({ id: r.id, receivedAt: r.received_at, payload: JSON.parse(r.payload) }));
  return json({ ok: true, rows, lastId: rows.length ? rows[rows.length - 1].id : since, hasMore: rows.length === EXPORT_PAGE_SIZE });
}
export async function handleTelemetry(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!env.TELEMETRY) return json({ ok: false, error: "telemetry storage not configured" }, 503);
  try {
    if (url.pathname === "/api/telemetry/ingest" && request.method === "POST") return await ingest(request, env);
    if (url.pathname === "/api/telemetry/export" && request.method === "GET") return await exportRows(env, url);
    if (url.pathname === "/api/telemetry/health" && request.method === "GET") return json({ ok: true });
  } catch (e) { return json({ ok: false, error: "storage error" }, 500); }
  return json({ ok: false, error: "not found" }, 404);
}
