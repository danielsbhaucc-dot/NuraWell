import type { Metadata, Viewport } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ComingSoonExperience } from '@/components/coming-soon/ComingSoonExperience';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'בקרוב — NuraWell',
  description: 'משהו גדול בדרך. NuraWell — המהפכה שתשנה את הדרך שבה אתה חושב על עצמך.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#05010f',
};

async function getSong(): Promise<{ url: string | null; title: string | null }> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('site_settings')
      .select('coming_soon_song_url, coming_soon_song_title')
      .eq('id', 1)
      .maybeSingle();
    return {
      url: (data?.coming_soon_song_url as string | null) ?? null,
      title: (data?.coming_soon_song_title as string | null) ?? null,
    };
  } catch {
    return { url: null, title: null };
  }
}

export default async function ComingSoonPage() {
  const song = await getSong();
  return <ComingSoonExperience songUrl={song.url} songTitle={song.title} />;
}
