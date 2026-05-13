import { z } from 'zod';

export const STOCK_IMAGE_PROVIDER_URLS = {
  pixabay: 'https://pixabay.com/',
  pexels: 'https://www.pexels.com/',
} as const;

export const stationCoverCreditSchema = z
  .object({
    source: z.enum(['pixabay', 'pexels']),
    photographer: z.string().min(1).max(200),
    page_url: z.string().url().max(2000),
    photographer_url: z.string().url().max(2000).optional(),
    provider_url: z.string().url().max(2000),
  })
  .strict();

export type StationCoverCredit = z.infer<typeof stationCoverCreditSchema>;

export function providerHomeUrl(source: StationCoverCredit['source']): string {
  return STOCK_IMAGE_PROVIDER_URLS[source];
}

export function buildStationCoverCredit(input: {
  source: StationCoverCredit['source'];
  photographer: string;
  page_url: string;
  photographer_url?: string | null;
}): StationCoverCredit {
  return {
    source: input.source,
    photographer: input.photographer,
    page_url: input.page_url,
    photographer_url: input.photographer_url ?? undefined,
    provider_url: providerHomeUrl(input.source),
  };
}

export function normalizeStationCoverCredit(
  credit: Partial<StationCoverCredit> | null | undefined
): StationCoverCredit | null {
  if (!credit?.source || !credit.photographer || !credit.page_url) return null;
  const parsed = stationCoverCreditSchema.safeParse({
    source: credit.source,
    photographer: credit.photographer,
    page_url: credit.page_url,
    photographer_url: credit.photographer_url,
    provider_url: credit.provider_url ?? providerHomeUrl(credit.source),
  });
  return parsed.success ? parsed.data : null;
}

export function providerLabel(source: StationCoverCredit['source']): string {
  return source === 'pixabay' ? 'Pixabay' : 'Pexels';
}
