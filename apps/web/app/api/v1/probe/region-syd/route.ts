import { runRegionProbe } from '@/lib/probe/region-probe';
export const preferredRegion = 'syd1';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET() { return runRegionProbe('syd1'); }
