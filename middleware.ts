import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''
  const isNative = userAgent.includes('BookifiedMobileApp')

  if (isNative) {
    // Rewrite all requests from the mobile app to include a hidden query parameter
    // This forces Vercel's Edge Cache to treat mobile app requests completely separately
    // from regular website requests!
    const url = request.nextUrl.clone()
    url.searchParams.set('_app', '1')
    return NextResponse.rewrite(url)
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
