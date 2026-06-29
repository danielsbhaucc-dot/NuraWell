import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { challengeRouteForPhase, resolveChallengePhase } from '@/lib/challenge/phase';
import { ChallengeIntroExperience } from '@/components/challenge/ChallengeIntroExperience';
import { parseLyricsConfig } from '@/lib/coming-soon/lyrics';
import { parseRevolutionLines } from '@/lib/coming-soon/revolution-lines';
import { parseChallengeIntroLines } from '@/lib/challenge/content';
import { firstNameFromFullName } from '@/lib/challenge/gender-copy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'פתיחת האתגר — NuraWell',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05010f',
};

async function getIntroConfig() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('site_settings')
    .select(
      'coming_soon_song_url, coming_soon_song_title, coming_soon_lyrics, coming_soon_revolution_lines, challenge_intro_lines, challenge_intro_tts_url',
    )
    .eq('id', 1)
    .maybeSingle();
  return {
    url: (data?.coming_soon_song_url as string | null) ?? null,
    title: (data?.coming_soon_song_title as string | null) ?? null,
    lyrics: parseLyricsConfig(data?.coming_soon_lyrics),
    revolutionLines: parseRevolutionLines(data?.coming_soon_revolution_lines),
    introLines: parseChallengeIntroLines(data?.challenge_intro_lines),
    introTtsUrl: (data?.challenge_intro_tts_url as string | null) ?? null,
  };
}

export default async function ChallengeIntroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/challenge/intro');

  const enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment) redirect('/home');

  const phase = resolveChallengePhase(enrollment);
  if (phase === 'waiting') redirect('/challenge');
  if (phase === 'eating_window_setup' || phase === 'active') {
    redirect(challengeRouteForPhase(phase));
  }

  const [config, profile] = await Promise.all([
    getIntroConfig(),
    supabase.from('profiles').select('full_name, gender').eq('id', user.id).single(),
  ]);

  return (
    <ChallengeIntroExperience
      songUrl={config.url}
      songTitle={config.title}
      lyrics={config.lyrics}
      revolutionLines={config.revolutionLines}
      introLines={config.introLines}
      introTtsUrl={config.introTtsUrl}
      firstName={firstNameFromFullName(profile.data?.full_name as string | null)}
      gender={(profile.data?.gender as string | null) ?? null}
      isDemo={enrollment.is_demo}
    />
  );
}
