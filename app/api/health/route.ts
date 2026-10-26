import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const REQUIRED_ENV = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
] as const;

// GET /api/health → デプロイ後の設定チェック。値そのものは返さず ok / ng だけを返す
export async function GET() {
  const checks: Record<string, "ok" | "ng"> = {};
  for (const name of REQUIRED_ENV) checks[name] = process.env[name] ? "ok" : "ng";

  const encKey = process.env.TOKEN_ENC_KEY;
  checks.TOKEN_ENC_KEY = encKey && Buffer.from(encKey, "base64").length === 32 ? "ok" : "ng";

  // schema.sql を実行済みか（users テーブルが読めるか）
  checks.supabase_schema = "ng";
  if (checks.SUPABASE_URL === "ok" && checks.SUPABASE_SERVICE_ROLE_KEY === "ok") {
    try {
      const { error } = await db().from("users").select("id").limit(1);
      if (!error) checks.supabase_schema = "ok";
    } catch {
      // 接続できない場合は ng のまま
    }
  }

  const ready = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ready, checks }, { status: ready ? 200 : 503 });
}
