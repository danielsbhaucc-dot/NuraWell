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
