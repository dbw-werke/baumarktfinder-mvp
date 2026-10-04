import { lookupObi } from "../../../../lib/obi-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {"Cache-Control":"private, no-store"};
export async function POST(request: Request): Promise<Response> {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== host)) return Response.json({error:"Nur innerhalb der Baumarktfinder-App verfügbar."},{status:403,headers});
    if (Number(request.headers.get("content-length")) > 1024) return Response.json({error:"Anfrage zu groß."},{status:413,headers});
    const text = await request.text();
    if (text.length > 1024) return Response.json({error:"Anfrage zu groß."},{status:413,headers});
    let input: unknown; try { input=JSON.parse(text); } catch { return Response.json({error:"Ungültige Suchanfrage."},{status:400,headers}); }
    if (!input || typeof input !== "object" || Object.keys(input).some(key=>key!=="query") || !("query" in input) || typeof input.query !== "string"
      || input.query.trim().length < 2 || input.query.length > 160 || /[<>\u0000-\u001f]|https?:\/\//i.test(input.query)) return Response.json({error:"Bitte einen Materialbegriff mit 2 bis 160 Zeichen eingeben."},{status:400,headers});
    return Response.json(await lookupObi(input.query),{headers});
  } catch { return Response.json({error:"Die OBI-Suche ist momentan nicht erreichbar."},{status:503,headers}); }
}
