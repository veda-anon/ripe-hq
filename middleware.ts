import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionToken, safeEqual } from "./lib/auth";

export async function middleware(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;
    if (pathname.startsWith("/login") || pathname.startsWith("/api/cron")) return NextResponse.next();

    const secret = (process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD || "").trim();
    if (!secret) {
      // Refuse to run wide open: this app can send email as you.
      return new NextResponse("Set DASHBOARD_PASSWORD in your Vercel environment variables (Production), then redeploy.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const cookie = req.cookies.get(COOKIE)?.value ?? "";
    if (cookie && safeEqual(cookie, await sessionToken(secret))) return NextResponse.next();

    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  } catch (e: any) {
    // Show the reason instead of Vercel's generic MIDDLEWARE_INVOCATION_FAILED page
    return new NextResponse(`Ripe HQ login gate error: ${e?.message ?? String(e)}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.svg).*)"],
};
