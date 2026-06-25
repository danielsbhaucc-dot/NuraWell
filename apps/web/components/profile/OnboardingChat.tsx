'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { motion } from 'framer-motion';
import { Check, ChevronRight, FileLock2, MessageCircle, Send, X, Zap } from 'lucide-react';
import {
  FUN_ASSISTANT_BUBBLE,
  FUN_CHAT_BG,
  FUN_HEADER_BG,
  FUN_USER_BUBBLE,
  FunConfettiBurst,
  FunFloatingAmbience,
  FunPathSelectHero,
  FunTypingLine,
} from '@/components/profile/onboarding-fun-experience';
import { ALMOG_AVATAR_FALLBACK } from '@/lib/ai/almog-avatar';
import { useAlmogAvatarUrl } from '@/lib/client/useAlmogAvatarUrl';
import { useChatBackground } from '@/lib/client/useChatBackground';
import { useVisualDrawerLayout } from '@/lib/client/use-visual-drawer-layout';
import type { OnboardingExtracted } from '@/lib/ai/onboarding-chat-llm';
import type { DiscreteFieldKey } from '@/lib/ai/onboarding-discrete-fields';
import {
  DISCRETE_FIELD_LABELS,
  DISCRETE_FIELD_PLACEHOLDERS,
  discreteFieldPrivacyIntro,
} from '@/lib/ai/onboarding-discrete-fields';
import { type ProfileFieldFlags } from '@/lib/profile/extracted-field-flags';
import {
  buildProfileChatBootstrap,
  shouldClarifyProfileUpdateIntent,
  type ProfileRowForChat,
} from '@/lib/profile/profile-chat-bootstrap';
import { firstNameFrom } from '@/lib/profile/personalized-copy';
import {
  dispatchOpenAlmogChat,
  setProfileOnboardingChatVisible,
} from '@/lib/notifications/open-almog-chat';

type Turn = { role: 'user' | 'assistant'; content: string; secret?: boolean };

type OnboardingPath = 'quick' | 'fun';

type ApiResponse = {
  reply: string;
  extracted_public: OnboardingExtracted;
  field_flags: ProfileFieldFlags;
  request_discrete_field: DiscreteFieldKey | null;
  ready_for_summary: boolean;
  summary: string | null;
  persisted: boolean;
  error?: string;
};

interface OnboardingChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** נתוני פרופיל קיימים — דגלים ושדות ציבוריים בלבד */
  profileSnapshot?: ProfileRowForChat | null;
}

const EXTRACTED_LABELS: Record<string, string> = {
  full_name: 'שם',
  gender: 'פנייה',
  main_goal: 'מטרה',
  current_weight_kg: 'משקל נוכחי',
  goal_weight_kg: 'משקל יעד',
  weakest_time_of_day: 'זמן חלש',
  main_obstacle: 'מכשול',
  main_obstacle_detail: 'פירוט',
  wake_up_time: 'השכמה',
  sleep_time: 'שינה',
};

const FLAG_TO_LABEL: Record<string, string> = {
  has_full_name: 'שם',
  has_gender: 'פנייה',
  has_main_goal: 'מטרה',
  has_current_weight: 'משקל נוכחי',
  has_goal_weight: 'משקל יעד',
  has_weakest_time: 'זמן חלש',
  has_main_obstacle: 'מכשול',
  has_wake_time: 'השכמה',
  has_sleep_time: 'שינה',
};

const PATH_LABEL: Record<OnboardingPath, string> = {
  quick: 'מסלול מהיר',
  fun: 'מסלול כייפי',
};

function AlmogAvatar({
  size = 40,
  className = '',
  fun = false,
}: {
  size?: number;
  className?: string;
  fun?: boolean;
}) {
  const { avatarUrl } = useAlmogAvatarUrl();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {fun ? (
        <motion.div
          className="absolute -inset-1 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, #f472b6, #fbbf24, #a78bfa, #f472b6)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          aria-hidden
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt="אלמוג"
        width={size}
        height={size}
        className={`relative rounded-full object-cover object-top border-2 ${
          fun ? 'border-white/50' : 'border-emerald-400/40'
        } ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
        }}
      />
    </div>
  );
}

function AlmogTypingIndicator({ fun = false }: { fun?: boolean }) {
  return (
    <div className="flex justify-end items-end gap-2">
      <div className="flex flex-col items-end gap-1">
        {fun ? (
          <FunTypingLine />
        ) : (
          <span className="text-[11px] font-semibold text-emerald-200/85 px-0.5">אלמוג מקליד…</span>
        )}
        <div
          className="rounded-[20px] rounded-bl-md px-4 py-3"
          style={
            fun
              ? FUN_ASSISTANT_BUBBLE
              : {
                  background: 'linear-gradient(145deg, rgba(4,120,87,0.92), rgba(16,185,129,0.85))',
                  border: '1px solid rgba(255,255,255,0.15)',
                }
          }
        >
          <span className="inline-flex items-center gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className={`h-2 w-2 rounded-full ${fun ? 'bg-white' : 'bg-white/90'}`}
                animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
              />
            ))}
          </span>
        </div>
      </div>
      <AlmogAvatar size={32} className="mb-0.5 shrink-0" fun={fun} />
    </div>
  );
}

type DrawerPhase = 'intent' | 'paths' | 'chat';

function ChatHeader({
  path,
  phase,
  onBack,
  onClose,
}: {
  path: OnboardingPath | null;
  phase: DrawerPhase;
  onBack: () => void;
  onClose: () => void;
}) {
  const isPathSelect = phase === 'paths';
  const isFun = path === 'fun';

  const subtitle =
    phase === 'chat' && path
      ? PATH_LABEL[path]
      : phase === 'intent'
        ? 'עדכון פרופיל · בירור'
        : 'עדכון פרופיל · בחר מסלול';

  const showBack = phase === 'chat' || phase === 'paths';

  return (
    <div
      dir="rtl"
      className="shrink-0 rounded-t-[28px] border-b border-white/10"
      style={{
        background: isFun
          ? FUN_HEADER_BG
          : isPathSelect
            ? 'linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(15,23,42,0.88) 100%)'
            : 'linear-gradient(160deg, #064e3b 0%, #047857 50%, #0c1222 100%)',
        paddingTop: 'max(10px, env(safe-area-inset-top, 0px))',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Drawer.Handle className="mx-auto mb-2 mt-1 h-1.5 w-12 shrink-0 rounded-full bg-white/40" />
      <div className="flex items-center gap-2.5 px-3 pb-3.5">
        <div className="flex shrink-0 items-center gap-2.5">
          <div
            className="shrink-0 rounded-full p-0.5"
            style={{
              background: 'linear-gradient(140deg, rgba(255,255,255,0.45), rgba(255,255,255,0.1))',
            }}
          >
            <AlmogAvatar size={40} className="border-white/30" fun={isFun} />
          </div>
          <div className="text-right">
            <p className="text-[16px] font-black leading-none text-white">אלמוג</p>
            <p className="mt-1 text-[11px] font-medium text-white/75">{subtitle}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1" aria-hidden />

        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white border border-white/15"
            aria-label={phase === 'chat' ? 'חזרה לבחירת מסלול' : 'חזרה'}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/90 border border-white/15"
          aria-label="סגירה"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function ProfileUpdateIntentScreen({
  firstName,
  savedLabels,
  gender,
  onConfirm,
  onDismiss,
}: {
  firstName: string;
  savedLabels: string[];
  gender: 'male' | 'female' | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const prompt =
    gender === 'female'
      ? `${firstName}, נראה שכבר השלמת את הפרופיל`
      : gender === 'male'
        ? `${firstName}, נראה שכבר השלמת את הפרופיל`
        : 'נראה שכבר השלמת את הפרופיל';

  return (
    <div dir="rtl" className="relative min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="flex flex-col items-center gap-4">
        <AlmogAvatar size={72} className="border-white/40" />
        <div className="text-center">
          <p className="text-white text-[17px] font-black leading-tight">{prompt} ✓</p>
          <p className="mt-2 text-white/75 text-[13px] leading-relaxed">
            רוצה לעדכן פרטים שכבר שמורים, או שהגעת בטעות?
          </p>
        </div>

        {savedLabels.length > 0 ? (
          <div className="w-full rounded-2xl border border-white/10 bg-white/6 px-4 py-3 backdrop-blur-sm">
            <p className="text-[11px] font-bold text-emerald-200/90 mb-2">מה שכבר שמור אצלי:</p>
            <div className="flex flex-wrap gap-1.5">
              {savedLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-100"
                  style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(52,211,153,0.3)' }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-2xl px-4 py-3.5 text-sm font-black text-white active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(5,150,105,0.9))' }}
        >
          כן, לעדכן פרטים
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm font-semibold text-slate-200 active:scale-[0.98]"
        >
          לא עכשיו
        </button>
      </div>
    </div>
  );
}

export function OnboardingChat({ open, onOpenChange, onSaved, profileSnapshot }: OnboardingChatProps) {
  const initialBootstrap = useMemo(
    () => buildProfileChatBootstrap(profileSnapshot),
    [profileSnapshot]
  );
  const profileGender =
    profileSnapshot?.gender === 'male' || profileSnapshot?.gender === 'female'
      ? profileSnapshot.gender
      : null;
  const needsIntentClarify = useMemo(
    () =>
      shouldClarifyProfileUpdateIntent(
        initialBootstrap.fieldFlags,
        profileSnapshot?.onboarding_completed
      ),
    [initialBootstrap.fieldFlags, profileSnapshot?.onboarding_completed]
  );
  const savedFieldLabels = useMemo(
    () =>
      Object.entries(initialBootstrap.fieldFlags)
        .filter(([, v]) => v)
        .map(([k]) => FLAG_TO_LABEL[k] ?? k),
    [initialBootstrap.fieldFlags]
  );
  const chatFirstName = firstNameFrom(profileSnapshot?.full_name ?? null);
  const [phase, setPhase] = useState<DrawerPhase>('paths');
  const [updateMode, setUpdateMode] = useState(false);
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [funBurst, setFunBurst] = useState(false);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extractedPublic, setExtractedPublic] = useState<OnboardingExtracted>({});
  const [fieldFlags, setFieldFlags] = useState<ProfileFieldFlags>({
    has_full_name: false,
    has_gender: false,
    has_main_goal: false,
    has_current_weight: false,
    has_goal_weight: false,
    has_weakest_time: false,
    has_main_obstacle: false,
    has_wake_time: false,
    has_sleep_time: false,
  });
  const [pendingDiscrete, setPendingDiscrete] = useState<DiscreteFieldKey | null>(null);
  const [discreteField, setDiscreteField] = useState<DiscreteFieldKey | null>(null);
  const [discreteValue, setDiscreteValue] = useState('');
  const [readyForSummary, setReadyForSummary] = useState(false);
  const [saved, setSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { url: backgroundUrl } = useChatBackground();
  const drawerLayout = useVisualDrawerLayout(open);

  useEffect(() => {
    setProfileOnboardingChatVisible(open);
    return () => setProfileOnboardingChatVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPhase('paths');
      setUpdateMode(false);
      setPath(null);
      setFunBurst(false);
      setMessages([]);
      setExtractedPublic({});
      setFieldFlags({
        has_full_name: false,
        has_gender: false,
        has_main_goal: false,
        has_current_weight: false,
        has_goal_weight: false,
        has_weakest_time: false,
        has_main_obstacle: false,
        has_wake_time: false,
        has_sleep_time: false,
      });
      setPendingDiscrete(null);
      setDiscreteField(null);
      setDiscreteValue('');
      setReadyForSummary(false);
      setSaved(false);
      setInput('');
      return;
    }
    setPhase(needsIntentClarify ? 'intent' : 'paths');
    setUpdateMode(false);
    setFieldFlags(initialBootstrap.fieldFlags);
    setExtractedPublic(initialBootstrap.extractedPublic);
  }, [open, initialBootstrap, needsIntentClarify]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading, discreteField, pendingDiscrete]);

  async function apiCall(body: Record<string, unknown>): Promise<ApiResponse | null> {
    const res = await fetch('/api/v1/ai/onboarding-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        extracted_public: extractedPublic,
        field_flags: fieldFlags,
        update_mode: updateMode || undefined,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiResponse;
  }

  function applyApiResponse(json: ApiResponse) {
    setExtractedPublic((prev) => ({ ...prev, ...json.extracted_public }));
    setFieldFlags(json.field_flags);
    setReadyForSummary(json.ready_for_summary);
    if (json.request_discrete_field) {
      setPendingDiscrete(json.request_discrete_field);
      setDiscreteField(null);
      setDiscreteValue('');
    } else {
      setPendingDiscrete(null);
      setDiscreteField(null);
    }
  }

  async function startPath(selected: OnboardingPath) {
    if (selected === 'fun') setFunBurst(true);
    setPath(selected);
    setPhase('chat');
    setLoading(true);
    const json = await apiCall({ is_opening: true, path: selected, messages: [] });
    setLoading(false);
    if (!json) return;
    setMessages([{ role: 'assistant', content: json.reply }]);
    applyApiResponse(json);
  }

  function openDiscreteChannel() {
    if (!pendingDiscrete) return;
    setDiscreteField(pendingDiscrete);
    setPendingDiscrete(null);
  }

  function confirmIntent() {
    setUpdateMode(true);
    setPhase('paths');
  }

  function handleHeaderBack() {
    if (phase === 'chat') {
      goBackToPaths();
      return;
    }
    if (phase === 'paths' && needsIntentClarify) {
      setPhase('intent');
      setUpdateMode(false);
    }
  }

  function goBackToPaths() {
    setFunBurst(false);
    setPath(null);
    setPhase('paths');
    setMessages([]);
    setPendingDiscrete(null);
    setDiscreteField(null);
    setDiscreteValue('');
    setReadyForSummary(false);
    setSaved(false);
    setInput('');
    setFieldFlags(initialBootstrap.fieldFlags);
    setExtractedPublic(initialBootstrap.extractedPublic);
  }

  function goToMainChat() {
    onOpenChange(false);
    dispatchOpenAlmogChat();
  }

  async function sendDiscrete() {
    const value = discreteValue.trim();
    if (!value || !discreteField || loading) return;
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: '📎 נשלח בערוץ מאובטח', secret: true },
    ]);
    setDiscreteValue('');
    const key = discreteField;
    setDiscreteField(null);

    try {
      const res = await fetch('/api/v1/profile/private-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          envelope: { mode: 'tls-v1', value },
          field_flags: fieldFlags,
          path,
        }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        reply: string;
        field_flags: ProfileFieldFlags;
        extracted_public: OnboardingExtracted;
        request_discrete_field?: DiscreteFieldKey | null;
        ready_for_summary?: boolean;
      };
      setFieldFlags(json.field_flags);
      setExtractedPublic((prev) => ({ ...prev, ...json.extracted_public }));
      setReadyForSummary(Boolean(json.ready_for_summary));
      if (json.request_discrete_field) {
        setPendingDiscrete(json.request_discrete_field);
        setDiscreteField(null);
      } else {
        setPendingDiscrete(null);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendTurn(history: Turn[], persist = false) {
    setLoading(true);
    const json = await apiCall({
      messages: history.map(({ role, content }) => ({ role, content })),
      path,
      persist,
    });
    setLoading(false);
    if (!json) return;

    if (!persist) {
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply }]);
    }
    applyApiResponse(json);
    if (persist && json.persisted) {
      setSaved(true);
      onSaved?.();
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !path) return;
    setInput('');
    const next: Turn[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    await sendTurn(next);
  }

  async function handleSave() {
    if (loading) return;
    await sendTurn(messages, true);
  }

  const collectedFlagKeys = Object.entries(fieldFlags)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const collectedPublicKeys = Object.keys(extractedPublic).filter((k) => EXTRACTED_LABELS[k]);
  const isFun = path === 'fun';
  const drawerPhase: DrawerPhase = path ? 'chat' : phase;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[200] bg-black/55" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[210] mx-auto flex w-full max-w-md flex-col rounded-t-[28px] outline-none overflow-hidden"
          style={{
            ...(drawerLayout
              ? {
                  top: `${drawerLayout.top}px`,
                  height: `${drawerLayout.height}px`,
                  bottom: 'auto',
                  maxHeight: 'none',
                }
              : {
                  height: 'min(92dvh, 720px)',
                }),
            background: path ? '#0c1222' : 'transparent',
            boxShadow: '0 -24px 80px rgba(4,120,87,0.25)',
          }}
        >
          <Drawer.Title className="sr-only">עדכון פרופיל עם אלמוג</Drawer.Title>
          <Drawer.Description className="sr-only">שיחה לעדכון פרטים אישיים</Drawer.Description>

          <div className="absolute inset-0 pointer-events-none">
            {backgroundUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={backgroundUrl}
                alt=""
                className={`h-full w-full object-cover ${path ? 'opacity-[0.15]' : 'opacity-55'}`}
              />
            ) : (
              <div className="h-full w-full bg-[#0c1222]" />
            )}
            <div
              className="absolute inset-0"
              style={{
                background: path
                  ? isFun
                    ? FUN_CHAT_BG
                    : 'linear-gradient(180deg, rgba(4,120,87,0.3) 0%, rgba(12,18,34,0.95) 40%, #0c1222 100%)'
                  : 'linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(2,6,23,0.82) 55%, rgba(2,6,23,0.94) 100%)',
              }}
            />
            {isFun ? <FunFloatingAmbience /> : null}
          </div>

          <FunConfettiBurst active={funBurst} />

          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <ChatHeader
              path={path}
              phase={drawerPhase}
              onBack={handleHeaderBack}
              onClose={() => onOpenChange(false)}
            />

            {phase === 'intent' && !path ? (
              <ProfileUpdateIntentScreen
                firstName={chatFirstName}
                savedLabels={savedFieldLabels}
                gender={profileGender}
                onConfirm={confirmIntent}
                onDismiss={() => onOpenChange(false)}
              />
            ) : !path ? (
              <div dir="rtl" className="relative min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="flex flex-col items-center gap-4">
                  <motion.div
                    className="shrink-0 rounded-full p-1"
                    style={{
                      background: 'linear-gradient(140deg, rgba(255,255,255,0.5), rgba(255,255,255,0.12))',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                    }}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <AlmogAvatar size={72} className="border-white/40" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-white text-[17px] font-black leading-tight">איך בא לך לעדכן?</p>
                    <p className="mt-1 text-white/70 text-[12px] font-medium">
                      בחר מסלול — אחד מהם עם קונפטי 🎊
                    </p>
                  </div>

                  <FunPathSelectHero onSelect={() => void startPath('fun')} />

                  <button
                    type="button"
                    onClick={() => void startPath('quick')}
                    className="w-full flex items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-4 py-3.5 text-right active:scale-[0.98] backdrop-blur-sm"
                  >
                    <Zap className="h-5 w-5 text-emerald-300 shrink-0" />
                    <span>
                      <span className="block text-white font-bold text-sm">מסלול מהיר</span>
                      <span className="block text-slate-300 text-xs mt-0.5">ישיר, רציני, בלי בדיחות</span>
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {(collectedFlagKeys.length > 0 || collectedPublicKeys.length > 0) && (
                  <div dir="rtl" className="shrink-0 flex flex-wrap gap-1.5 px-4 py-2 border-b border-white/5">
                    {collectedFlagKeys.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-100"
                        style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(52,211,153,0.3)' }}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                        {FLAG_TO_LABEL[k] ?? k}
                      </span>
                    ))}
                    {collectedPublicKeys.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-100"
                        style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(52,211,153,0.3)' }}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                        {EXTRACTED_LABELS[k]}
                      </span>
                    ))}
                  </div>
                )}

                <div dir="rtl" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
                  {messages.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={isFun ? { opacity: 0, y: 10, scale: 0.97 } : false}
                      animate={isFun ? { opacity: 1, y: 0, scale: 1 } : undefined}
                      transition={isFun ? { type: 'spring', stiffness: 380, damping: 28 } : undefined}
                      className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end items-end gap-2'}`}
                    >
                      {m.role === 'assistant' ? (
                        <div
                          className="max-w-[82%] rounded-[20px] rounded-bl-md px-3.5 py-2.5 text-[14px] leading-relaxed"
                          style={
                            isFun
                              ? FUN_ASSISTANT_BUBBLE
                              : {
                                  background: 'linear-gradient(145deg, #047857 0%, #059669 55%, #10b981 100%)',
                                  color: '#fff',
                                  border: '1px solid rgba(255,255,255,0.18)',
                                  boxShadow: '0 6px 20px rgba(16,185,129,0.22)',
                                }
                          }
                        >
                          {m.secret ? (
                            <span className="flex items-center gap-1.5 text-amber-200 text-[13px]">
                              <span aria-hidden>🔐</span>
                              {m.content}
                            </span>
                          ) : (
                            m.content
                          )}
                        </div>
                      ) : (
                        <div
                          className="max-w-[82%] rounded-[20px] rounded-tr-md px-3.5 py-2.5 text-[14px] leading-relaxed"
                          style={
                            isFun
                              ? FUN_USER_BUBBLE
                              : {
                                  background: 'rgba(255,255,255,0.1)',
                                  color: '#f1f5f9',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                }
                          }
                        >
                          {m.secret ? (
                            <span className="flex items-center gap-1.5 text-amber-200 text-[13px]">
                              <span aria-hidden>🔐</span>
                              {m.content}
                            </span>
                          ) : (
                            m.content
                          )}
                        </div>
                      )}
                      {m.role === 'assistant' ? (
                        <AlmogAvatar
                          size={28}
                          className={`mb-0.5 shrink-0 ${isFun ? 'border-white/40' : 'border-emerald-500/30'}`}
                          fun={isFun}
                        />
                      ) : null}
                    </motion.div>
                  ))}

                  {loading ? <AlmogTypingIndicator fun={isFun} /> : null}
                  <div ref={bottomRef} className="h-px shrink-0" />
                </div>

                <div
                  dir="rtl"
                  className="shrink-0 border-t border-white/8"
                  style={{
                    background: isFun ? 'rgba(15,8,28,0.98)' : '#0c1222',
                    paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  {pendingDiscrete ? (
                    <div className="px-4 pt-3 pb-3 space-y-3 border-b border-amber-400/20 bg-amber-950/30">
                      <p className="text-[13px] font-bold text-amber-200 flex items-center gap-1.5">
                        <span aria-hidden>🔐</span>
                        ערוץ פרטי — {DISCRETE_FIELD_LABELS[pendingDiscrete]}
                      </p>
                      <p className="text-[13px] leading-relaxed text-amber-100/95">
                        {discreteFieldPrivacyIntro(pendingDiscrete, profileGender)}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={openDiscreteChannel}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #b45309, #f59e0b)' }}
                        >
                          <span aria-hidden>🔐</span>
                          שלח בערוץ מאובטח
                        </button>
                        <button
                          type="button"
                          onClick={goToMainChat}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm font-semibold text-slate-200"
                        >
                          <MessageCircle className="h-4 w-4" />
                          המשך בצ&apos;אט הרגיל
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {discreteField ? (
                    <div className="px-4 pt-2 pb-2 space-y-2">
                      <p className="text-[11px] font-bold text-amber-200/90 flex items-center gap-1">
                        <FileLock2 className="h-3.5 w-3.5" />
                        {DISCRETE_FIELD_LABELS[discreteField]} · מוצפן
                      </p>
                      <div className="flex gap-2">
                        <input
                          value={discreteValue}
                          onChange={(e) => setDiscreteValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void sendDiscrete();
                          }}
                          placeholder={DISCRETE_FIELD_PLACEHOLDERS[discreteField]}
                          className="flex-1 rounded-xl px-3 py-2.5 text-base text-emerald-50 outline-none placeholder:text-slate-500"
                          style={{
                            background: 'rgba(16,185,129,0.12)',
                            border: '1px solid rgba(52,211,153,0.35)',
                          }}
                          dir="rtl"
                          type={discreteField.includes('weight') ? 'number' : 'text'}
                        />
                        <button
                          type="button"
                          onClick={() => void sendDiscrete()}
                          disabled={!discreteValue.trim() || loading}
                          className="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                        >
                          שלח
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {readyForSummary && !saved ? (
                    <div className="px-4 pb-2">
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(145deg, #b45309, #f59e0b)' }}
                      >
                        <Check className="h-4 w-4" />
                        שמור לפרופיל
                      </button>
                    </div>
                  ) : null}

                  {saved ? (
                    <p className="px-4 pb-2 text-center text-[13px] font-bold text-emerald-300">
                      עודכן בהצלחה
                    </p>
                  ) : null}

                  {!discreteField ? (
                    <div className="flex items-center gap-2 px-4 py-3">
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void handleSend();
                          }
                        }}
                        placeholder="כתוב לאלמוג…"
                        className="min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-base text-slate-100 outline-none placeholder:text-slate-500"
                        style={{
                          background: isFun ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.07)',
                          border: isFun
                            ? '1px solid rgba(251,191,36,0.25)'
                            : '1px solid rgba(255,255,255,0.1)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={loading || !input.trim()}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40"
                        style={{
                          background: isFun
                            ? 'linear-gradient(145deg, #a21caf, #f59e0b)'
                            : 'linear-gradient(145deg, #047857, #10b981)',
                        }}
                        aria-label="שליחה"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
