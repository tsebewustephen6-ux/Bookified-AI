import { NextResponse } from "next/server";
import type { NextRequest } from 'next/server'

export default function proxy(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''
  const isNative = userAgent.includes('BookifiedMobileApp')

  if (isNative) {
    const url = request.nextUrl.clone()
    url.searchParams.set('_app', '1')
    return NextResponse.rewrite(url)
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
