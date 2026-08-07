import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "leadflow-secret-change-in-production";
const COOKIE_NAME = "leadflow_session";

const encoder = new TextEncoder();

// Routes that require authentication
const PROTECTED_ROUTES = [
  "/dashboard",
  "/agents",
  "/campaigns",
  "/prospects",
  "/billing",
  "/settings",
];

// Auth routes (redirect to dashboard if already logged in)
const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  let isAuthenticated = false;

  if (token) {
    try {
      await jwtVerify(token, encoder.encode(JWT_SECRET));
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
  }

  // Redirect to login if accessing protected route without auth
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route)) && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to dashboard if accessing auth routes while logged in
  if (AUTH_ROUTES.includes(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/agents/:path*",
    "/campaigns/:path*",
    "/prospects/:path*",
    "/billing/:path*",
    "/settings/:path*",
    "/login",
    "/signup",
  ],
};
