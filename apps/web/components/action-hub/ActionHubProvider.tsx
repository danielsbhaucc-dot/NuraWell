'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Drawer } from 'vaul';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ChevronLeft, UserX } from 'lucide-react';
import { useProgressReport } from '../progress-report/ProgressReportProvider';
import {
  countTaskStatusesByReport,
  type JourneyReportStepShape,
} from '../../lib/journey/journey-report-parse';

type JourneyReportResponse = { steps: JourneyReportStepShape[] };

type ActionHubContextValue = {
  open: () => void;
  close: () => void;
};

const ActionHubContext = createContext<ActionHubContextValue | null>(null);

export function useActionHub(): ActionHubContextValue {
  const ctx = useContext(ActionHubContext);
  if (!ctx) throw new Error('ActionHubProvider חסר בעץ הקומפוננטות');
  return ctx;
}

export function ActionHubProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const progressReport = useProgressReport();
  const router = useRouter();

  const refreshCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/journey-report', { cache: 'no-store' });
      const json = (await res.json()) as JourneyReportResponse & { error?: string };
      if (!res.ok) return;
      const { accepted, rejected } = countTaskStatusesByReport(json.steps ?? []);
      setAcceptedCount(accepted);
      setRejectedCount(rejected);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (menuOpen) void refreshCounts();
  }, [menuOpen, refreshCounts]);

  const close = useCallback(() => setMenuOpen(false), []);

  const openUpdateTasks = useCallback(() => {
    close();
    progressReport.open('task_execution');
  }, [close, progressReport]);

  const openDeclined = useCallback(() => {
    close();
    router.push('/journey/declined');
  }, [close, router]);

  const value: ActionHubContextValue = {
    open: () => setMenuOpen(true),
    close,
  };

  return (
    <ActionHubContext.Provider value={value}>
      {children}

      <Drawer.Root open={menuOpen} onOpenChange={setMenuOpen} direction="bottom" shouldScaleBackground>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[210] bg-emerald-950/35 backdrop-blur-[2px]" />
          <Drawer.Content
            dir="rtl"
            className="fixed bottom-0 right-0 left-0 z-[215] mx-auto flex w-full max-w-md flex-col rounded-t-[28px] outline-none"
            style={{
              maxHeight: 'min(88dvh, 520px)',
              border: '1px solid rgba(255,255,255,0.4)',
              background:
                'linear-gradient(165deg, rgba(255,255,255,0.5) 0%, rgba(236,253,245,0.52) 48%, rgba(255,255,255,0.42) 100%)',
              boxShadow: '0 -24px 56px rgba(6,78,59,0.16)',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
            }}
          >
            <Drawer.Title className="sr-only">דיווח התקדמות למנטור</Drawer.Title>
            <Drawer.Description className="sr-only">
              עדכון ביצוע משימות והרגלים למנטור, או צפייה במשימות שלא נלקחו על עצמך
            </Drawer.Description>

            <div className="shrink-0 pt-2.5 pb-2 flex justify-center">
              <div className="h-1.5 w-11 rounded-full bg-emerald-800/22" />
            </div>

            <div className="shrink-0 px-5 pb-4 text-right">
              <p
                className="text-lg font-black text-[#1A1730]"
                style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
              >
                עדכון למנטור
              </p>
              <p className="text-xs font-semibold text-emerald-900/72 mt-1 leading-relaxed">
                דווחו לאלמוג על התקדמות — משימות והרגלים מהמסע
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-1 space-y-3 scrollbar-hide">
              <button
                type="button"
                onClick={openUpdateTasks}
                className="w-full text-right rounded-[22px] p-[1px] transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.55), rgba(52,211,153,0.35), rgba(255,255,255,0.65))',
                  boxShadow: '0 12px 36px rgba(6,78,59,0.1)',
                }}
              >
                <div
                  className="flex items-center gap-4 rounded-[21px] px-4 py-4 flex-row-reverse"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(236,253,245,0.45) 100%)',
                    border: '1px solid rgba(255,255,255,0.65)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
                  }}
                >
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      background: 'linear-gradient(145deg, #047857, #10b981)',
                      boxShadow: '0 8px 22px rgba(4,120,87,0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
                    }}
                  >
                    <ClipboardCheck className="h-7 w-7 text-white" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-[15px] text-[#1A1730] leading-snug">עדכון משימות</p>
                    <p className="text-[12px] text-emerald-900/75 font-semibold mt-1 leading-relaxed">
                      {loading
                        ? 'טוען…'
                        : acceptedCount > 0
                          ? `${acceptedCount} משימות מקובלות — סמנו ביצוע`
                          : 'סמנו ביצוע למשימות שקיבלתם במסע'}
                    </p>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-emerald-800/35 shrink-0" aria-hidden />
                </div>
              </button>

              <button
                type="button"
                onClick={openDeclined}
                className="w-full text-right rounded-[22px] p-[1px] transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
                style={{
                  background: 'linear-gradient(135deg, rgba(251,113,133,0.45), rgba(254,215,170,0.35), rgba(255,255,255,0.6))',
                  boxShadow: '0 12px 36px rgba(190,24,93,0.08)',
                }}
              >
                <div
                  className="flex items-center gap-4 rounded-[21px] px-4 py-4 flex-row-reverse"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.76) 0%, rgba(255,241,242,0.42) 100%)',
                    border: '1px solid rgba(255,255,255,0.65)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88)',
                  }}
                >
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      background: 'linear-gradient(145deg, #be123c, #fb7185)',
                      boxShadow: '0 8px 22px rgba(190,18,60,0.22), inset 0 1px 0 rgba(255,255,255,0.2)',
                    }}
                  >
                    <UserX className="h-7 w-7 text-white" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-[15px] text-[#1A1730] leading-snug">
                      משימות שלא לקחתי על עצמי
                    </p>
                    <p className="text-[12px] text-rose-900/75 font-semibold mt-1 leading-relaxed">
                      {loading
                        ? 'טוען…'
                        : rejectedCount > 0
                          ? `${rejectedCount} משימות סומנו כלא מקובלות כרגע`
                          : 'עדיין אין — אפשר לחזור לסיכום צעד ולעדכן'}
                    </p>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-rose-800/35 shrink-0" aria-hidden />
                </div>
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </ActionHubContext.Provider>
  );
}
