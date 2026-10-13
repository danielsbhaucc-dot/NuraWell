import { runLlmProbe } from '@/lib/probe/llm-probe';
export const preferredRegion = 'fra1';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET() { return runLlmProbe(); }
