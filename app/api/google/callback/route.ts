import { google } from "googleapis";
import { oauthClient } from "@/lib/google";
import { env } from "@/lib/config";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

// Step 2: Google sends you back here. We show the refresh token once so you can paste it into Vercel.
// It is never stored by the app.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  if (!code) return new Response("Missing code", { status: 400 });
  const client = oauthClient(`${env.appUrl}/api/google/callback`);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email = "";
  try {
    email = (await google.gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" })).data.emailAddress ?? "";
  } catch {}
  // Decide which variable this belongs in from the address actually signed in, not just the button clicked
  const isRipe = email ? email.toLowerCase().endsWith("@ripe.care") : params.get("state") === "ripe";
  const varName = isRipe ? "GOOGLE_REFRESH_TOKEN_RIPE" : "GOOGLE_REFRESH_TOKEN";
  const token = tokens.refresh_token ?? "(No refresh token came back. Remove Ripe HQ at myaccount.google.com/permissions for this account, then connect again.)";

  const html = `<!doctype html><meta charset="utf-8"><title>Google connected</title>
<body style="font-family:system-ui;background:#FCF9F5;color:#5A1A0B;max-width:640px;margin:64px auto;padding:0 20px;line-height:1.6">
<h1 style="font-family:Georgia,serif;font-weight:400">Almost there</h1>
<p>You signed in as <b>${esc(email || "unknown")}</b>.</p>
<p>In Vercel (Project → Settings → Environment Variables), add this as <b>${varName}</b>, then redeploy.</p>
<textarea readonly style="width:100%;height:120px;font:14px monospace;padding:12px;border:1.5px solid #5A1A0B;border-radius:4px" onclick="this.select()">${esc(token)}</textarea>
<p style="font-size:14px">Treat it like a password. Anyone with it can read and send email as ${esc(email || "this account")}.</p>
<p><a href="/settings" style="color:#B15538">Back to Connections</a></p></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
