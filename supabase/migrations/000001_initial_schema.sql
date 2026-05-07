-- Initial Schema for Weight Loss Course System
-- Created: May 2026
-- Description: Complete database schema with RLS policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (extends Supabase Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    birth_date DATE,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Courses table
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    is_published BOOLEAN DEFAULT FALSE,
    is_premium BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lessons table
CREATE TABLE public.lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    lesson_type TEXT DEFAULT 'mixed' CHECK (lesson_type IN ('video', 'audio', 'text', 'pdf', 'presentation', 'mixed')),
    text_content TEXT,
    external_links JSONB DEFAULT '[]',
    tasks JSONB DEFAULT '[]',
    habits JSONB DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT FALSE,
    duration_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media Files table (Uploadthing + Video URLs)
CREATE TABLE public.media_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('audio', 'pdf', 'presentation', 'video_url')),
    -- Uploadthing fields
    uploadthing_key TEXT,
    uploadthing_url TEXT,
    uploadthing_name TEXT,
    uploadthing_size INTEGER,
    -- Video provider fields
    video_provider TEXT CHECK (video_provider IN ('bunny', 'heygen', 'youtube', 'vimeo', 'custom')),
    video_external_id TEXT,
    video_external_url TEXT,
    -- Metadata
    duration_seconds INTEGER,
    mime_type TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enrollments table
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, course_id)
);

-- Lesson Progress table
CREATE TABLE public.lesson_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    task_progress JSONB DEFAULT '{}',
    habit_progress JSONB DEFAULT '{}',
    time_spent_seconds INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, lesson_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Media files indexes
CREATE INDEX idx_media_files_lesson ON public.media_files(lesson_id);
CREATE INDEX idx_media_files_type ON public.media_files(file_type);

-- Lessons indexes
CREATE INDEX idx_lessons_course ON public.lessons(course_id);
CREATE INDEX idx_lessons_published ON public.lessons(is_published);

-- Progress indexes
CREATE INDEX idx_lesson_progress_user ON public.lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_lesson ON public.lesson_progress(lesson_id);
CREATE INDEX idx_lesson_progress_completed ON public.lesson_progress(is_completed);

-- Enrollments indexes
CREATE INDEX idx_enrollments_user ON public.enrollments(user_id);
CREATE INDEX idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX idx_enrollments_active ON public.enrollments(is_active);

-- Courses indexes
CREATE INDEX idx_courses_published ON public.courses(is_published);
CREATE INDEX idx_courses_premium ON public.courses(is_premium);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- Helper function: check admin without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Profiles policies (no self-reference to avoid recursion)
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Courses policies
CREATE POLICY "Anyone can view published courses"
    ON public.courses FOR SELECT
    USING (is_published = TRUE OR public.is_admin());

CREATE POLICY "Only admin can modify courses"
    ON public.courses FOR ALL
    USING (public.is_admin());

-- Lessons policies
CREATE POLICY "Enrolled users can view lessons"
    ON public.lessons FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE user_id = auth.uid() AND course_id = lessons.course_id
    ) OR public.is_admin());

CREATE POLICY "Only admin can modify lessons"
    ON public.lessons FOR ALL
    USING (public.is_admin());

-- Media files policies
CREATE POLICY "Enrolled users can view media"
    ON public.media_files FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.lessons l
        JOIN public.enrollments e ON e.course_id = l.course_id
        WHERE l.id = media_files.lesson_id AND e.user_id = auth.uid()
    ) OR public.is_admin());

CREATE POLICY "Only admin can modify media"
    ON public.media_files FOR ALL
    USING (public.is_admin());

-- Enrollments policies
CREATE POLICY "Users can view own enrollments"
    ON public.enrollments FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admin can manage enrollments"
    ON public.enrollments FOR ALL
    USING (public.is_admin());

-- Lesson progress policies
CREATE POLICY "Users can view own progress"
    ON public.lesson_progress FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can update own progress"
    ON public.lesson_progress FOR ALL
    USING (user_id = auth.uid());

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at
    BEFORE UPDATE ON public.lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        'user'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- STORAGE SETUP (execute in Supabase dashboard)
-- ============================================

-- Note: Create storage buckets via Supabase dashboard:
-- 1. course-thumbnails - for course thumbnail images
-- 2. lesson-images - for lesson content images
-- 3. Set appropriate RLS policies for storage
