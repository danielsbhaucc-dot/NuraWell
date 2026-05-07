// Journey Step Types — for the "המסע שלי" interactive lesson system

export interface JourneyStep {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  step_number: number;
  is_published: boolean;

  // Video
  video_provider: 'heygen' | 'bunny' | 'youtube' | 'vimeo' | 'custom' | null;
  video_external_id: string | null;
  video_external_url: string | null;
  video_title: string | null;

  // Content
  summary_text: string | null;
  text_content: string | null;
  duration_minutes: number | null;

  // Structured data (JSONB in DB)
  quiz_questions: QuizQuestion[];
  game_items: GameItem[];
  commitment: CommitmentData | null;
  researches: Research[];
  tasks: JourneyTask[];
  habits: JourneyHabit[];

  // PDF / downloads
  pdf_url: string | null;
  pdf_name: string | null;

  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface GameItem {
  id: string;
  statement: string;
  is_true: boolean;
  explanation: string;
}

export interface CommitmentData {
  text: string;
  emoji: string;
  description: string;
}

export interface Research {
  id: string;
  title: string;
  authors: string;
  year: string;
  journal: string;
  finding: string;
  url: string | null;
}

export interface JourneyTask {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
}

export interface JourneyHabit {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  frequency: 'daily' | 'weekly' | 'per_meal';
}

// Progress tracking
export interface JourneyStepProgress {
  step_id: string;
  user_id: string;
  video_watched: boolean;
  quiz_answers: Record<string, number>; // questionId -> selectedIndex
  quiz_score: number | null;
  game_answers: Record<string, boolean>; // itemId -> userAnswer
  game_score: number | null;
  commitment_accepted: boolean;
  tasks_completed: Record<string, boolean>;
  habits_progress: Record<string, boolean[]>;
  is_completed: boolean;
  completed_at: string | null;
  last_section: StepSection;
}

export type StepSection = 'video' | 'quiz' | 'game' | 'commitment' | 'summary';

// For the journey list page
export interface JourneyStepWithProgress extends JourneyStep {
  progress: JourneyStepProgress | null;
}
