import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

const PASSCODE_HASH = '2440809e3ec26b00648124b65a81946fff578a91c8365009ffe4dd0e964af874';

export async function POST(req: NextRequest) {
  const { passcode } = await req.json() as { passcode: string };
  if (!passcode) return NextResponse.json({ ok: false }, { status: 400 });
  const hash = createHash('sha256').update(passcode).digest('hex');
  return hash === PASSCODE_HASH
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false }, { status: 401 });
}
