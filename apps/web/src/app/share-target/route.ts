import { NextResponse, type NextRequest } from "next/server";

export function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/share?installed=false", request.url), 303);
}
