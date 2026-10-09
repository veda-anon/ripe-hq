import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionToken, safeEqual } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/cron")) return NextResponse.next();

  const secret = process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!secret) {
    // Refuse to run wide open: this app can send email as you.
    return new NextResponse("Set DASHBOARD_PASSWORD in your Vercel environment variables, then redeploy.", { status: 503 });
  }
  const cookie = req.cookies.get(COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken(secret))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.svg).*)"],
};
