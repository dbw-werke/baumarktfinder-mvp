import { findOsmNearby, OsmError } from "../../../lib/osm-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const origin = request.headers.get("origin");
    // Next.js can construct request.url with its internal listen hostname. The
    // browser's Host header names the app origin it actually opened (e.g. 127.0.0.1).
    const requestedHost = request.headers.get("host") ?? new URL(request.url).host;
    if (origin && new URL(origin).host !== requestedHost) return Response.json({ error: "Diese Suche ist nur innerhalb der Baumarktfinder-App verfügbar." }, { status: 403, headers });
    if (Number(request.headers.get("content-length")) > 2048) return Response.json({ error: "Die Suchanfrage ist zu groß." }, { status: 413, headers });
    const text = await request.text();
    if (text.length > 2048) return Response.json({ error: "Die Suchanfrage ist zu groß." }, { status: 413, headers });
    let input: unknown;
    try { input = JSON.parse(text) as unknown; } catch { throw new OsmError("Ungültige Suchanfrage.", 400); }
    return Response.json(await findOsmNearby(input), { headers });
  } catch (error) {
    const failure = error instanceof OsmError ? error : new OsmError("Die offene Standortsuche ist gerade nicht verfügbar.");
    return Response.json({ error: failure.message }, { status: failure.status, headers: { ...headers, ...(failure.status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
