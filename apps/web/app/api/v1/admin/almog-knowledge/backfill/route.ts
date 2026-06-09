import { NextResponse } from 'next/server';
import { syncKnowledgeVectorsForRow, type AlmogKnowledgeRow } from '@/lib/admin/almog-knowledge';
import {
  deleteSystemKnowledgeVectorsByIds,
  isSystemKnowledgeVectorConfigured,
  rangeAllSystemKnowledgeVectors,
  type SystemKnowledgeVectorMetadata,
} from '@/lib/ai/system-knowledge-vector';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type LegacyBatch = {
  batchId: string;
  legacyVectorIds: string[];
  chunks: Array<{ index: number; text: string; metadata: SystemKnowledgeVectorMetadata }>;
};

function parseChunkIndex(chunkId: string): number | null {
  const parts = chunkId.split(':');
  if (parts.length < 2) return null;
  const idx = Number.parseInt(parts[parts.length - 1]!, 10);
  return Number.isFinite(idx) ? idx : null;
}

function batchIdFromChunkId(chunkId: string): string | null {
  const idx = chunkId.lastIndexOf(':');
  if (idx <= 0) return null;
  return chunkId.slice(0, idx);
}

function titleFromBatch(batch: LegacyBatch): string {
  const m0 = batch.chunks[0]?.metadata;
  if (m0?.dataType === 'step' && typeof m0.stepNumber === 'number') {
    const st = m0.stationTitle;
    return st ? `שלב ${m0.stepNumber} · ${st}` : `שלב ${m0.stepNumber}`;
  }
  if (m0?.dataType === 'course' && m0.courseId) {
    return `קורס ${m0.courseId}`;
  }
  return `ייבוא ${batch.batchId.slice(0, 8)}`;
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  if (!isSystemKnowledgeVectorConfigured()) {
    return NextResponse.json({ error: 'משתני אינדקס ידע מערכת חסרים' }, { status: 500 });
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: existingCount } = await admin
    .from('almog_knowledge')
    .select('*', { count: 'exact', head: true });

  if ((existingCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'כבר קיימים מסמכי ידע — ייבוא זמין רק כשהטבלה ריקה' },
      { status: 400 }
    );
  }

  const vectors = await rangeAllSystemKnowledgeVectors({ limitPerPage: 100 });
  const batches = new Map<string, LegacyBatch>();

  for (const v of vectors) {
    const meta = v.metadata as SystemKnowledgeVectorMetadata | undefined;
    if (!meta?.chunkId || typeof meta.text !== 'string') continue;

    const batchId = batchIdFromChunkId(meta.chunkId);
    if (!batchId) continue;

    const index = parseChunkIndex(meta.chunkId);
    if (index == null) continue;

    let batch = batches.get(batchId);
    if (!batch) {
      batch = { batchId, legacyVectorIds: [], chunks: [] };
      batches.set(batchId, batch);
    }
    batch.legacyVectorIds.push(v.id);
    batch.chunks.push({ index, text: meta.text, metadata: meta });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const batch of batches.values()) {
    batch.chunks.sort((a, b) => a.index - b.index);
    const body = batch.chunks.map((c) => c.text).join('\n\n');
    const m0 = batch.chunks[0]!.metadata;

    if (!m0.dataType || !m0.accessLevel) {
      skipped += 1;
      continue;
    }

    const rowPayload: Record<string, unknown> = {
      title: titleFromBatch(batch),
      body,
      data_type: m0.dataType,
      access_level: m0.accessLevel,
      step_id: m0.dataType === 'step' ? (m0.stepId ?? null) : null,
      course_id: m0.courseId ?? null,
      step_number: m0.stepNumber ?? null,
      station_id: m0.stationId ?? null,
      station_title: m0.stationTitle ?? null,
      station_order: m0.stationOrder ?? null,
      chunk_count: 0,
      created_by: auth.user.id,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await admin
      .from('almog_knowledge')
      .insert(rowPayload)
      .select('*')
      .single();

    if (insertErr || !inserted) {
      errors.push(insertErr?.message ?? batch.batchId);
      skipped += 1;
      continue;
    }

    const row = inserted as AlmogKnowledgeRow;

    try {
      const { chunkCount } = await syncKnowledgeVectorsForRow(row, 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await admin
        .from('almog_knowledge')
        .update({ chunk_count: chunkCount })
        .eq('id', row.id);
      await deleteSystemKnowledgeVectorsByIds(batch.legacyVectorIds);
      imported += 1;
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await admin.from('almog_knowledge').delete().eq('id', row.id);
      errors.push(e instanceof Error ? e.message : batch.batchId);
      skipped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    legacyBatches: batches.size,
    legacyVectors: vectors.length,
    errors: errors.slice(0, 20),
  });
}
