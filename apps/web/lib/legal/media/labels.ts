/** Client-safe media provenance vocabulary (no node crypto). */
export const SOURCE_TYPES = [
  'in_house', 'stock_cc0', 'stock_license', 'ai_image', 'ai_music', 'ai_voice',
  'font_license', 'library_license', 'owner_upload', 'unknown',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABEL_HE: Record<SourceType, string> = {
  in_house: 'נוצר בבית (קוד)',
  stock_cc0: 'מאגר חופשי (CC0)',
  stock_license: 'מאגר ברישיון',
  ai_image: 'תמונה מ־AI',
  ai_music: 'מוזיקה מ־AI',
  ai_voice: 'קול מ־AI',
  font_license: 'גופן ברישיון פתוח',
  library_license: 'ספריית קוד פתוח',
  owner_upload: 'הועלה על ידי דניאל',
  unknown: 'חסר מקור',
};

export const MEDIA_KINDS_ALL = ['image', 'illustration', 'icon', 'audio', 'video', 'font', 'file'] as const;
export type AssetKind = (typeof MEDIA_KINDS_ALL)[number];
export type AssetOrigin = 'repo' | 'inline' | 'storage' | 'font' | 'library';

export const GENERATORS = {
  gpt_image: { label: 'GPT Image (OpenAI)', tos: 'https://openai.com/policies/terms-of-use/' },
  grok: { label: 'Grok Imagine (xAI)', tos: 'https://x.ai/legal/terms-of-service' },
  nano_banana: { label: 'Nano Banana (Google Gemini)', tos: 'https://policies.google.com/terms' },
  suno: { label: 'Suno', tos: 'https://suno.com/terms' },
  gemini_music: { label: 'Gemini / Lyria (Google)', tos: 'https://policies.google.com/terms' },
  elevenlabs: { label: 'ElevenLabs', tos: 'https://elevenlabs.io/terms-of-use' },
  other: { label: 'אחר', tos: '' },
} as const;
export type GeneratorId = keyof typeof GENERATORS;

export const LICENSES = {
  pixabay: { name: 'Pixabay Content License', url: 'https://pixabay.com/service/license-summary/' },
  pexels: { name: 'Pexels License', url: 'https://www.pexels.com/license/' },
  cc0: { name: 'CC0 1.0 Universal', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  ofl: { name: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org/open-font-license-official-text/' },
  isc: { name: 'ISC License', url: 'https://opensource.org/license/isc-license-txt' },
  mit: { name: 'MIT License', url: 'https://opensource.org/license/mit' },
} as const;

/** Every field a provenance record may carry. All optional; which are required depends on source_type. */
export type Provenance = {
  source_type?: SourceType;
  source_url?: string | null;
  author?: string | null;
  author_url?: string | null;
  license_name?: string | null;
  license_url?: string | null;
  generator?: GeneratorId | null;
  model?: string | null;
  prompt?: string | null;
  created_on?: string | null; // YYYY-MM-DD
  account?: string | null; // account / plan label (no passwords)
  plan?: string | null;
  track_id?: string | null;
  track_url?: string | null;
  tos_url?: string | null;
  notes?: string | null;
  attachments?: Array<{ sha256: string; name: string; mime: string; label: string }>;
  confirmed_by_owner?: boolean;
  /** 'pending' keeps the asset open until the decisive proof (e.g. purchase receipt + download) is attached. */
  receipt_ids?: string[];
  license_status?: 'pending' | 'confirmed' | null;
};

export const REQUIRED: Record<SourceType, Array<keyof Provenance>> = {
  in_house: [],
  stock_cc0: ['source_url', 'license_name', 'license_url'],
  stock_license: ['source_url', 'author', 'license_name', 'license_url'],
  ai_image: ['generator', 'prompt', 'created_on', 'plan'],
  ai_music: ['generator', 'track_url', 'created_on', 'plan', 'attachments'],
  ai_voice: ['generator', 'plan', 'attachments'],
  font_license: ['license_name', 'license_url'],
  library_license: ['license_name', 'license_url'],
  owner_upload: ['notes'],
  unknown: ['source_type'],
};

export const FIELD_LABEL_HE: Partial<Record<keyof Provenance, string>> = {
  source_type: 'סוג המקור',
  source_url: 'קישור למקור',
  author: 'יוצר',
  license_name: 'שם הרישיון',
  license_url: 'קישור לרישיון',
  generator: 'מחולל',
  prompt: 'הפרומפט',
  created_on: 'תאריך יצירה',
  plan: 'מסלול המנוי בזמן היצירה',
  track_url: 'קישור לשיר במחולל',
  attachments: 'קבלה או חשבונית',
  notes: 'מאיפה הקובץ',
  license_status: 'קבלת רכישה והוכחת הורדה (הרישיון ממתין)',
};

