import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { SESSION_COOKIE_KEY } from "@/lib/auth-session"
import { resolveAuthRedirect } from "@/lib/auth-redirect"

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE_KEY)?.value
  const decision = resolveAuthRedirect(pathname, search, Boolean(token))

  if (decision.redirectTo) {
    return NextResponse.redirect(new URL(decision.redirectTo, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
}
