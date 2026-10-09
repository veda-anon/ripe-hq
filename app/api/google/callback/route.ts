import { oauthClient } from "@/lib/google";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";

// Step 2: Google sends you back here. We show the refresh token once so you can paste it into Vercel.
// It is never stored by the app.
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return new Response("Missing code", { status: 400 });
  const client = oauthClient(`${env.appUrl}/api/google/callback`);
  const { tokens } = await client.getToken(code);
  const token = tokens.refresh_token ?? "(no refresh token returned. Remove Ripe HQ at myaccount.google.com/permissions and try again)";
  const html = `<!doctype html><meta charset="utf-8"><title>Google connected</title>
<body style="font-family:system-ui;background:#FCF9F5;color:#5A1A0B;max-width:640px;margin:64px auto;padding:0 20px;line-height:1.6">
<h1 style="font-family:Georgia,serif;font-weight:400">Almost there</h1>
<p>Copy this value into Vercel as <b>GOOGLE_REFRESH_TOKEN</b> (Project → Settings → Environment Variables), then redeploy.</p>
<textarea readonly style="width:100%;height:120px;font:14px monospace;padding:12px;border:1.5px solid #5A1A0B;border-radius:4px" onclick="this.select()">${token.replace(/</g, "&lt;")}</textarea>
<p style="font-size:14px">Treat it like a password. Anyone with it can read and send your email.</p>
<p><a href="/settings" style="color:#B15538">Back to Settings</a></p></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
