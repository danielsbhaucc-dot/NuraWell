import { z } from 'zod';

export const MEDIA_KINDS = ['image', 'audio', 'file', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const FILE_SUBTYPES = [
  'pdf',
  'presentation',
  'word',
  'spreadsheet',
  'archive',
  'other',
] as const;
export type FileSubtype = (typeof FILE_SUBTYPES)[number];

export const MEDIA_SOURCES = ['upload', 'pixabay', 'pexels', 'suno', 'other'] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

/** קרדיט מאוחד לכל סוגי המדיה. */
export const mediaCreditSchema = z
  .object({
    source: z.string().min(1).max(120).optional(),
    author: z.string().max(200).optional(),
    photographer: z.string().max(200).optional(),
    title: z.string().max(300).nullable().optional(),
    link: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
    page_url: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
    photographer_url: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
    provider_url: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
    license: z.string().max(200).nullable().optional(),
    requires_attribution: z.boolean().optional(),
  })
  .strict();

export type MediaCredit = z.infer<typeof mediaCreditSchema>;

export const mediaAssetListQuerySchema = z.object({
  kind: z.enum(MEDIA_KINDS).optional(),
  file_subtype: z.enum(FILE_SUBTYPES).optional(),
  folder: z.string().trim().max(200).optional(),
  folder_prefix: z.string().trim().max(200).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(6).max(60).optional().default(24),
});

export const mediaPresignSchema = z
  .object({
    kind: z.enum(['image', 'audio', 'file']),
    content_type: z.string().min(3).max(120),
    original_filename: z.string().max(300).optional(),
    file_subtype: z.enum(FILE_SUBTYPES).optional(),
  })
  .strict();

export const mediaCompleteUploadSchema = z
  .object({
    asset_id: z.string().uuid(),
    object_key: z.string().min(1).max(1000),
    kind: z.enum(['image', 'audio', 'file']),
    mime_type: z.string().min(3).max(120),
    title: z.string().min(1).max(300).optional(),
    original_filename: z.string().max(300).optional(),
    size_bytes: z.number().int().min(1),
    original_bytes: z.number().int().min(1).optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    duration_seconds: z.number().min(0).max(60 * 60).nullable().optional(),
    alt_text: z.string().max(500).optional(),
    folder: z.string().max(120).optional(),
    file_subtype: z.enum(FILE_SUBTYPES).optional(),
    source: z.enum(MEDIA_SOURCES).optional().default('upload'),
    credit: mediaCreditSchema.optional().default({}),
  })
  .strict();

export const mediaCompleteVideoSchema = z
  .object({
    kind: z.literal('video'),
    title: z.string().min(1).max(300),
    provider: z.literal('bunny'),
    external_id: z.string().min(1).max(500).optional(),
    external_url: z.string().url().max(2000).optional(),
    alt_text: z.string().max(500).optional(),
    folder: z.string().max(120).optional(),
    source: z.enum(MEDIA_SOURCES).optional().default('upload'),
    credit: mediaCreditSchema.optional().default({}),
  })
  .strict()
  .refine((d) => Boolean(d.external_id?.trim() || d.external_url?.trim()), {
    message: 'נדרש מזהה וידאו או כתובת HLS',
  });

export const mediaAssetPatchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    alt_text: z.string().max(500).nullable().optional(),
    folder: z.string().max(120).nullable().optional(),
    credit: mediaCreditSchema.optional(),
    source: z.enum(MEDIA_SOURCES).optional(),
  })
  .strict();

export type MediaAssetRow = {
  id: string;
  kind: MediaKind;
  file_subtype: FileSubtype | null;
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
  source: MediaSource;
  credit: MediaCredit;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
