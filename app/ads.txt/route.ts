import { adsConfig, adsTxt } from "@/lib/ads";

// GET /ads.txt → AdSense のサイト運営者 ID（環境変数 ADSENSE_CLIENT）があれば、その1行を返す
export const dynamic = "force-dynamic";

export function GET() {
  const body = adsTxt(adsConfig());
  if (!body) return new Response("Not Found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
