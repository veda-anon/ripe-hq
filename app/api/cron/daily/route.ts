import { NextResponse } from "next/server";
import { runDaily } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron calls this every morning with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runDaily();
  return NextResponse.json(report);
}
