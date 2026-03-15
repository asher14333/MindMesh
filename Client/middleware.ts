import { NextRequest, NextResponse } from "next/server";

/**
 * Route shape for hackathon:
 * - `/` shows marketing landing (implemented at `/landing`).
 * - `/app` shows the MindMesh meeting UI (re-exported under `/app`).
 *
 * We use a rewrite for `/` so the URL stays clean.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Serve marketing at `/` without changing the visible URL.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/landing";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude Next internals + common static files
    "/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
