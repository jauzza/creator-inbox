import { NextResponse, type NextRequest } from "next/server";
import { processWebhook } from "@/server/services/webhooks";

// Public endpoint: authenticated by HMAC signature, not by session; no CSRF (no cookies used).
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  // The simulator is driven in-process from the dashboard; it has no public webhook.
  if (provider !== "onlyfansapi_com") return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const raw = await req.text();
  const r = await processWebhook(provider, raw, req.headers);
  return NextResponse.json(r.body, { status: r.status });
}
