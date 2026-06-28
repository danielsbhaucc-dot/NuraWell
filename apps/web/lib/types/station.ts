export interface JourneyStation {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  cover_image_key: string | null;
  cover_image_credit: Record<string, unknown> | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface JourneyStationWithSteps extends JourneyStation {
  steps: JourneyStep[];
}

export interface JourneyStep {
  id: string;
  station_id: string;
  course_id: string | null;
  step_number: number;
  title: string;
  description: string | null;
  content: string | null;
  media_type: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed' | null;
  media_url: string | null;
  duration_minutes: number | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StationCoverImage {
  objectKey: string;
  credit: {
    source: 'pixabay' | 'pexels';
    photographer: string;
    page_url: string;
    photographer_url?: string;
    provider_url: string;
  } | null;
}
