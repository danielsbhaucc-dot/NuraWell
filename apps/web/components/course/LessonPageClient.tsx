'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, useCallback } from 'react';
import { LessonImmersivePath } from './LessonImmersivePath';
import type { LessonDetail, LessonProgressData } from '../../lib/types/course';
import type { ProfileGender } from '../../lib/profile/personalized-copy';

interface NavLesson { id: string; title: string; }

interface LessonPageClientProps {
  lesson: LessonDetail;
  initialProgress: LessonProgressData;
  prevLesson: NavLesson | null;
  nextLesson: NavLesson | null;
  userId: string;
  firstName?: string;
  gender?: ProfileGender;
}

async function saveProgress(
  userId: string,
  lessonId: string,
  update: Partial<LessonProgressData>
): Promise<void> {
  await fetch('/api/v1/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson_id: lessonId, ...update }),
  });
}

export function LessonPageClient({
  lesson, initialProgress, prevLesson, nextLesson, userId,
  firstName = 'חבר', gender = null,
}: LessonPageClientProps) {
  const router = useRouter();
  const [progress, setProgress] = useState<LessonProgressData>(initialProgress);
  const [isPending, startTransition] = useTransition();

  const handleTaskToggle = useCallback(async (taskId: string, completed: boolean) => {
    const newTaskProgress = { ...progress.task_progress, [taskId]: completed };
    setProgress(p => ({ ...p, task_progress: newTaskProgress }));
    await saveProgress(userId, lesson.id, { task_progress: newTaskProgress });
  }, [progress.task_progress, userId, lesson.id]);

  const handleHabitToggle = useCallback(async (habitId: string, dayIndex: number, completed: boolean) => {
    const currentDays = progress.habit_progress[habitId] || Array(7).fill(false);
    const newDays = [...currentDays];
    newDays[dayIndex] = completed;
    const newHabitProgress = { ...progress.habit_progress, [habitId]: newDays };
    setProgress(p => ({ ...p, habit_progress: newHabitProgress }));
    await saveProgress(userId, lesson.id, { habit_progress: newHabitProgress });
  }, [progress.habit_progress, userId, lesson.id]);

  const handleToggleComplete = useCallback(() => {
    const next = !progress.is_completed;
    startTransition(async () => {
      setProgress((p) => ({ ...p, is_completed: next }));
      await saveProgress(userId, lesson.id, { is_completed: next });
    });
  }, [progress.is_completed, userId, lesson.id]);

  const handleExit = useCallback(() => {
    router.push(`/guides/${lesson.course_id}`);
  }, [router, lesson.course_id]);

  return (
    <LessonImmersivePath
      lesson={lesson}
      progress={progress}
      prevLesson={prevLesson}
      nextLesson={nextLesson}
      gender={gender}
      onExit={handleExit}
      onTaskToggle={handleTaskToggle}
      onHabitToggle={handleHabitToggle}
      onToggleComplete={handleToggleComplete}
      isTogglingComplete={isPending}
    />
  );
}
