import { NextRequest, NextResponse } from 'next/server';

import {
  SIMULATOR_ACCESS_COOKIE,
  SIMULATOR_ACCESS_PARAM,
  isValidSimulatorAccessValue,
} from '@/lib/simulator-access';

export function middleware(request: NextRequest) {
  const accessValue = request.nextUrl.searchParams.get(SIMULATOR_ACCESS_PARAM);

  if (!accessValue) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.searchParams.delete(SIMULATOR_ACCESS_PARAM);

  const response = NextResponse.redirect(redirectUrl);

  if (isValidSimulatorAccessValue(accessValue)) {
    response.cookies.set(SIMULATOR_ACCESS_COOKIE, accessValue, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
