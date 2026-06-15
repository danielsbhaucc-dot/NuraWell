import { resolveAlmogPublicBaseUrl, resolveCdnImagesPrefix } from '../ai/almog-avatar';
import { avatarFallbackSvg } from '../ui/avatar-fallback-svg';
import type { MentorDefinition } from './registry';

export function getMentorAvatarFallback(mentor: MentorDefinition): string {
  return avatarFallbackSvg(mentor.fallbackInitial);
}

export function getMentorAvatarUrl(mentor: MentorDefinition, cacheBuster?: string): string {
  const normalized = resolveAlmogPublicBaseUrl();
  if (!normalized) return getMentorAvatarFallback(mentor);
  const url = `${normalized}${resolveCdnImagesPrefix()}/${mentor.objectKey}`;
  return cacheBuster ? `${url}?v=${encodeURIComponent(cacheBuster)}` : url;
}
