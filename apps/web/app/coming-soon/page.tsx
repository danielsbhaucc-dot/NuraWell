import type { Metadata, Viewport } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PublicAiPresence } from '@/components/ai/PublicAiPresence';
import { ComingSoonExperience } from '@/components/coming-soon/ComingSoonExperience';
import { parseLyricsConfig, type ComingSoonLyrics } from '@/lib/coming-soon/lyrics';
import { parseRevolutionLines } from '@/lib/coming-soon/revolution-lines';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'בקרוב — NuraWell',
  description: 'משהו גדול בדרך. NuraWell — המהפכה שתשנה את הדרך שבה אתה חושב על עצמך.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#05010f',
};

async function getComingSoonConfig(): Promise<{
  url: string | null;
  title: string | null;
  lyrics: ComingSoonLyrics | null;
  revolutionLines: string[] | null;
}> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await supabase
      .from('site_settings')
      .select(
        'coming_soon_song_url, coming_soon_song_title, coming_soon_lyrics, coming_soon_revolution_lines',
      )
      .eq('id', 1)
      .maybeSingle();
    return {
      url: (data?.coming_soon_song_url as string | null) ?? null,
      title: (data?.coming_soon_song_title as string | null) ?? null,
      lyrics: parseLyricsConfig(data?.coming_soon_lyrics),
      revolutionLines: parseRevolutionLines(data?.coming_soon_revolution_lines),
    };
  } catch {
    return { url: null, title: null, lyrics: null, revolutionLines: null };
  }
}

export default async function ComingSoonPage() {
  const config = await getComingSoonConfig();
  return (
    <>
      <ComingSoonExperience
        songUrl={config.url}
        songTitle={config.title}
        lyrics={config.lyrics}
        revolutionLines={config.revolutionLines}
      />
      <div className="fixed inset-x-0 bottom-5 z-30 px-4 pointer-events-none">
        <div className="pointer-events-auto">
          <PublicAiPresence compact />
        </div>
      </div>
    </>
  );
}
