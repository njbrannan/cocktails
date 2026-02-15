import { NextResponse } from "next/server";

const CORS_HEADERS = {
  // This API is already public (used by the web app). Enabling CORS allows the bundled iOS app
  // (capacitor://localhost) to call it too.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

export function withCors(response: NextResponse) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

export function corsPreflight() {
  return withCors(new NextResponse(null, { status: 204 }));
}

