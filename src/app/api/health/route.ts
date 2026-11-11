import { NextResponse } from "next/server";
import { db } from "@/server/db";

export async function GET() {
  try {
    await db().$queryRawUnsafe("SELECT 1");
    const hb = await db().integrationConfig.findUnique({ where: { id: "worker_heartbeat" } });
    const at = (hb?.settings as any)?.at ? new Date((hb!.settings as any).at) : null;
    const workerOk = !!at && Date.now() - at.getTime() < 60_000;
    return NextResponse.json({ ok: true, db: "ok", worker: workerOk ? "ok" : "not running", workerLastSeen: at });
  } catch {
    return NextResponse.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
