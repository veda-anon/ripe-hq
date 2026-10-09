import { NextResponse } from "next/server";
import { oauthClient, GOOGLE_SCOPES } from "@/lib/google";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";

// Step 1 of connecting a Google account. /api/google/auth?account=ripe or ?account=personal
export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get("account") === "ripe" ? "ripe" : "personal";
  const client = oauthClient(`${env.appUrl}/api/google/callback`);
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account", // always show the account picker so you choose the right one
    scope: GOOGLE_SCOPES,
    state: account,
    ...(account === "ripe" ? { hd: "ripe.care" } : {}),
  });
  return NextResponse.redirect(url);
}
