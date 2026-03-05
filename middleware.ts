import { NextResponse, type NextRequest } from "next/server";

// Simple protection for admin routes.
//
// Why: Supabase auth in this project is currently client-session based (localStorage),
// so we can't reliably protect /admin on the server without migrating auth to cookies.
//
// This middleware adds HTTP Basic Auth in front of /admin/* (and /api/admin/*).
// Set env vars in Vercel:
// - ADMIN_BASIC_USER
// - ADMIN_BASIC_PASS
//
// If env vars are not set:
// - In production: deny access (so /admin isn't accidentally public).
// - In dev: allow access (dev-friendly).

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Involved Events Admin"',
    },
  });
}

function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPath = pathname.startsWith("/admin");
  const isAdminApiPath = pathname.startsWith("/api/admin");
  if (!isAdminPath && !isAdminApiPath) return NextResponse.next();

  const user = (process.env.ADMIN_BASIC_USER || "").trim();
  const pass = (process.env.ADMIN_BASIC_PASS || "").trim();
  if (!user || !pass) {
    const isProd =
      process.env.VERCEL === "1" ||
      process.env.VERCEL === "true" ||
      process.env.NODE_ENV === "production";
    if (isProd) {
      return new NextResponse(
        "Admin auth is not configured. Set ADMIN_BASIC_USER and ADMIN_BASIC_PASS in your deployment environment.",
        { status: 500 },
      );
    }
    // If not configured, don't lock you out of dev.
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }

  const idx = decoded.indexOf(":");
  if (idx < 0) return unauthorized();
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  if (!safeEq(u, user) || !safeEq(p, pass)) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
