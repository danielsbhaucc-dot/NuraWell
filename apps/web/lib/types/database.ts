/**
 * Database types for Supabase
 * These should be generated from the actual database schema using:
 * npx supabase gen types typescript --project-id <project-id> --schema public > lib/types/database.ts
 * 
 * For now, we're defining the core types manually for AI clarity
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          birth_date: string | null;
          role: 'user' | 'admin';
          is_active: boolean;
          created_at: string;
          updated_at: string;
          /** 000002_ai_ready_tables */
          goal_weight_kg: number | null;
          current_weight_kg: number | null;
          height_cm: number | null;
          date_of_birth: string | null;
          gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
          activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
          dietary_preferences: Json;
          health_conditions: Json;
          ai_context: Json;
          notification_prefs: Json;
          onboarding_completed: boolean | null;
          streak_days: number | null;
          last_active_at: string | null;
          /** 000015_onboarding_profiles */
          main_goal: string | null;
          weakest_time_of_day: string | null;
          main_obstacle: string | null;
          main_obstacle_detail: string | null;
          wake_up_time: string | null;
          sleep_time: string | null;
          preferred_channel: string | null;
          ai_check_in_times: string[] | null;
          ai_system_prompt: string | null;
          register_background_key: string | null;
          register_background_credit: Json | null;
          /** 000016_profile_dinner_time */
          dinner_time: string | null;
          /** 000017_profile_meal_schedule */
          meal_count: number | null;
          meal_schedule: Json | null;
          /** 000018_profile_welcome_email */
          welcome_email_sent_at: string | null;
          /** 000020_dolev_welcome_seen */
          dolev_welcome_seen_at: string | null;
          /** 000021_almog_welcome_seen */
          almog_welcome_seen_at: string | null;
          almog_intro_email_sent_at: string | null;
          /** 000027_ai_notification_engine */
          daily_task: string | null;
          /** 000029_notification_response_tracking */
          last_responded_at: string | null;
          notification_count: number;
          /** 000044_churn_reengagement */
          engagement_status: string | null;
          engagement_status_updated_at: string | null;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          role?: 'user' | 'admin';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          goal_weight_kg?: number | null;
          current_weight_kg?: number | null;
          height_cm?: number | null;
          date_of_birth?: string | null;
          gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
          activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
          dietary_preferences?: Json;
          health_conditions?: Json;
          ai_context?: Json;
          notification_prefs?: Json;
          onboarding_completed?: boolean | null;
          streak_days?: number | null;
          last_active_at?: string | null;
          main_goal?: string | null;
          weakest_time_of_day?: string | null;
          main_obstacle?: string | null;
          main_obstacle_detail?: string | null;
          wake_up_time?: string | null;
          sleep_time?: string | null;
          preferred_channel?: string | null;
          ai_check_in_times?: string[] | null;
          ai_system_prompt?: string | null;
          register_background_key?: string | null;
          register_background_credit?: Json | null;
          dinner_time?: string | null;
          meal_count?: number | null;
          meal_schedule?: Json | null;
          welcome_email_sent_at?: string | null;
          dolev_welcome_seen_at?: string | null;
          almog_welcome_seen_at?: string | null;
          almog_intro_email_sent_at?: string | null;
          daily_task?: string | null;
          last_responded_at?: string | null;
          notification_count?: number;
          engagement_status?: string | null;
          engagement_status_updated_at?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          role?: 'user' | 'admin';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          goal_weight_kg?: number | null;
          current_weight_kg?: number | null;
          height_cm?: number | null;
          date_of_birth?: string | null;
          gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
          activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
          dietary_preferences?: Json;
          health_conditions?: Json;
          ai_context?: Json;
          notification_prefs?: Json;
          onboarding_completed?: boolean | null;
          streak_days?: number | null;
          last_active_at?: string | null;
          main_goal?: string | null;
          weakest_time_of_day?: string | null;
          main_obstacle?: string | null;
          main_obstacle_detail?: string | null;
          wake_up_time?: string | null;
          sleep_time?: string | null;
          preferred_channel?: string | null;
          ai_check_in_times?: string[] | null;
          ai_system_prompt?: string | null;
          register_background_key?: string | null;
          register_background_credit?: Json | null;
          dinner_time?: string | null;
          meal_count?: number | null;
          meal_schedule?: Json | null;
          welcome_email_sent_at?: string | null;
          dolev_welcome_seen_at?: string | null;
          almog_welcome_seen_at?: string | null;
          almog_intro_email_sent_at?: string | null;
          daily_task?: string | null;
          last_responded_at?: string | null;
          notification_count?: number;
          engagement_status?: string | null;
          engagement_status_updated_at?: string | null;
        };
      };
      courses: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          is_published: boolean;
          is_premium: boolean;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          thumbnail_url?: string | null;
          is_published?: boolean;
          is_premium?: boolean;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          is_published?: boolean;
          is_premium?: boolean;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      lessons: {
        Row: {
          id: string;
          course_id: string;
          title: string;
          description: string | null;
          lesson_type: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed';
          text_content: string | null;
          external_links: Json;
          tasks: Json;
          habits: Json;
          sort_order: number;
          is_published: boolean;
          duration_minutes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          title: string;
          description?: string | null;
          lesson_type?: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed';
          text_content?: string | null;
          external_links?: Json;
          tasks?: Json;
          habits?: Json;
          sort_order?: number;
          is_published?: boolean;
          duration_minutes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          title?: string;
          description?: string | null;
          lesson_type?: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed';
          text_content?: string | null;
          external_links?: Json;
          tasks?: Json;
          habits?: Json;
          sort_order?: number;
          is_published?: boolean;
          duration_minutes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      media_files: {
        Row: {
          id: string;
          lesson_id: string;
          file_type: 'audio' | 'pdf' | 'presentation' | 'video_url';
          uploadthing_key: string | null;
          uploadthing_url: string | null;
          uploadthing_name: string | null;
          uploadthing_size: number | null;
          video_provider: 'bunny' | 'heygen' | 'youtube' | 'vimeo' | 'custom' | null;
          video_external_id: string | null;
          video_external_url: string | null;
          duration_seconds: number | null;
          mime_type: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          file_type: 'audio' | 'pdf' | 'presentation' | 'video_url';
          uploadthing_key?: string | null;
          uploadthing_url?: string | null;
          uploadthing_name?: string | null;
          uploadthing_size?: number | null;
          video_provider?: 'bunny' | 'heygen' | 'youtube' | 'vimeo' | 'custom' | null;
          video_external_id?: string | null;
          video_external_url?: string | null;
          duration_seconds?: number | null;
          mime_type?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          file_type?: 'audio' | 'pdf' | 'presentation' | 'video_url';
          uploadthing_key?: string | null;
          uploadthing_url?: string | null;
          uploadthing_name?: string | null;
          uploadthing_size?: number | null;
          video_provider?: 'bunny' | 'heygen' | 'youtube' | 'vimeo' | 'custom' | null;
          video_external_id?: string | null;
          video_external_url?: string | null;
          duration_seconds?: number | null;
          mime_type?: string | null;
          sort_order?: number;
          created_at?: string;
        };
      };
      enrollments: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          enrolled_at: string;
          completed_at: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          course_id: string;
          enrolled_at?: string;
          completed_at?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: string;
          enrolled_at?: string;
          completed_at?: string | null;
          is_active?: boolean;
        };
      };
      lesson_progress: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string;
          is_completed: boolean;
          completed_at: string | null;
          task_progress: Json;
          habit_progress: Json;
          time_spent_seconds: number;
          last_accessed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lesson_id: string;
          is_completed?: boolean;
          completed_at?: string | null;
          task_progress?: Json;
          habit_progress?: Json;
          time_spent_seconds?: number;
          last_accessed_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          lesson_id?: string;
          is_completed?: boolean;
          completed_at?: string | null;
          task_progress?: Json;
          habit_progress?: Json;
          time_spent_seconds?: number;
          last_accessed_at?: string;
        };
      };
      /**
       * Periodic Summary Engine ("Memory Pyramid") — מיגרציה 000028.
       * סיכומים תקופתיים מצרפיים: daily → weekly → monthly →
       * quarterly → semi_annual → annual. UNIQUE על (user_id, type, period_key)
       * מאפשר UPSERT אידמפוטנטי (cron יכול לרוץ פעמיים בלי לייצר כפילויות).
       */
      periodic_summaries: {
        Row: {
          id: string;
          user_id: string;
          type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
          /**
           * מפתח קנוני של התקופה:
           *   daily       → 'YYYY-MM-DD'   (e.g. '2026-05-29')
           *   weekly      → 'YYYY-Www'     (e.g. '2026-W22')   — ISO 8601
           *   monthly     → 'YYYY-Mmm'     (e.g. '2026-M05')
           *   quarterly   → 'YYYY-Qq'      (e.g. '2026-Q2')
           *   semi_annual → 'YYYY-Hh'      (e.g. '2026-H1')
           *   annual      → 'YYYY'         (e.g. '2026')
           */
          period_key: string;
          /**
           * מתמטיקה דטרמיניסטית: completion_rate, completed_days, missed_days,
           * total_days, max_streak, weakest_day, misses_by_dow, best_child,
           * worst_child, start_date, end_date.
           */
          metrics: Json;
          ai_insight: string;
          ai_model: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
          period_key: string;
          metrics?: Json;
          ai_insight?: string;
          ai_model?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
          period_key?: string;
          metrics?: Json;
          ai_insight?: string;
          ai_model?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      /** 000033_audio_playlists */
      audio_playlists: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      /** 000033_audio_playlists */
      audio_tracks: {
        Row: {
          id: string;
          playlist_id: string;
          title: string;
          object_key: string;
          mime_type: string;
          duration_seconds: number | null;
          size_bytes: number | null;
          sort_order: number;
          credit: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          playlist_id: string;
          title: string;
          object_key: string;
          mime_type?: string;
          duration_seconds?: number | null;
          size_bytes?: number | null;
          sort_order?: number;
          credit?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          playlist_id?: string;
          title?: string;
          object_key?: string;
          mime_type?: string;
          duration_seconds?: number | null;
          size_bytes?: number | null;
          sort_order?: number;
          credit?: Json;
          created_at?: string;
        };
      };
      /** 000034_media_assets */
      media_assets: {
        Row: {
          id: string;
          kind: 'image' | 'audio' | 'file' | 'video';
          file_subtype: 'pdf' | 'presentation' | 'word' | 'spreadsheet' | 'archive' | 'other' | null;
          bucket: 'images' | 'audio' | 'files' | null;
          object_key: string | null;
          public_url: string | null;
          provider: 'bunny' | null;
          external_id: string | null;
          external_url: string | null;
          title: string | null;
          original_filename: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          original_bytes: number | null;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          alt_text: string | null;
          folder: string | null;
          source: string;
          credit: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind: 'image' | 'audio' | 'file' | 'video';
          file_subtype?: 'pdf' | 'presentation' | 'word' | 'spreadsheet' | 'archive' | 'other' | null;
          bucket?: 'images' | 'audio' | 'files' | null;
          object_key?: string | null;
          public_url?: string | null;
          provider?: 'bunny' | null;
          external_id?: string | null;
          external_url?: string | null;
          title?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          original_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          alt_text?: string | null;
          folder?: string | null;
          source?: string;
          credit?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kind?: 'image' | 'audio' | 'file' | 'video';
          file_subtype?: 'pdf' | 'presentation' | 'word' | 'spreadsheet' | 'archive' | 'other' | null;
          bucket?: 'images' | 'audio' | 'files' | null;
          object_key?: string | null;
          public_url?: string | null;
          provider?: 'bunny' | null;
          external_id?: string | null;
          external_url?: string | null;
          title?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          original_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          alt_text?: string | null;
          folder?: string | null;
          source?: string;
          credit?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      /** 000036_almog_knowledge */
      almog_knowledge: {
        Row: {
          id: string;
          title: string;
          body: string;
          data_type: 'step' | 'course';
          access_level: 'public' | 'premium';
          step_id: string | null;
          course_id: string | null;
          step_number: number | null;
          station_id: string | null;
          station_title: string | null;
          station_order: number | null;
          chunk_count: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title?: string;
          body: string;
          data_type: 'step' | 'course';
          access_level?: 'public' | 'premium';
          step_id?: string | null;
          course_id?: string | null;
          step_number?: number | null;
          station_id?: string | null;
          station_title?: string | null;
          station_order?: number | null;
          chunk_count?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          data_type?: 'step' | 'course';
          access_level?: 'public' | 'premium';
          step_id?: string | null;
          course_id?: string | null;
          step_number?: number | null;
          station_id?: string | null;
          station_title?: string | null;
          station_order?: number | null;
          chunk_count?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
