import { NextResponse } from 'next/server';
import { ASSET_TYPES, LTV_OPTIONS } from '@/lib/config';

export async function GET() {
  return NextResponse.json({ asset_types: ASSET_TYPES, ltv_options: LTV_OPTIONS });
}
