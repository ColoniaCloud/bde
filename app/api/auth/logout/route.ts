import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Cierra la sesión borrando la cookie. */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('payload-token');
  return response;
}
