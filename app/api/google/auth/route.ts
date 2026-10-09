import { NextResponse } from "next/server";
import { oauthClient, GOOGLE_SCOPES } from "@/lib/google";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";

// Step 1 of connecting Google: sends you to Google's consent screen.
export async function GET() {
  const client = oauthClient(`${env.appUrl}/api/google/callback`);
  const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES });
  return NextResponse.redirect(url);
}
