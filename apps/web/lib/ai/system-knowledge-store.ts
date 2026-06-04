import { chunkLongText } from './chunking';
import { mapLimit } from './map-limit';
import { embedTextForRag } from './openrouter-embeddings';
import {
  deleteSystemKnowledgeVectorsByIds,
  systemKnowledgeVectorId,
  systemKnowledgeVectorIdsForDoc,
  type SystemKnowledgeVectorMetadata,
  upsertSystemKnowledgeVectors,
} from './system-knowledge-vector';

const EMBED_CONCURRENCY = 8;

export type AlmogKnowledgeDocInput = {
  docId: string;
  body: string;
  dataType: 'step' | 'course';
  accessLevel: 'public' | 'premium';
  stepId?: string | null;
  courseId?: string | null;
  stepNumber?: number | null;
  stationId?: string | null;
  stationTitle?: string | null;
  stationOrder?: number | null;
};

export type IngestKnowledgeResult = {
  chunkCount: number;
  vectorIds: string[];
};

/**
 * מפצל מסמך, יוצר embeddings, ושומר ב-Upstash עם מזהים דטרמיניסטיים docId:index.
 */
export async function ingestKnowledgeDoc(doc: AlmogKnowledgeDocInput): Promise<IngestKnowledgeResult> {
  const chunks = chunkLongText(doc.body);
  if (chunks.length === 0) {
    throw new Error('הטקסט ריק לאחר ניקוי');
  }

  const embeddings = await mapLimit(chunks, EMBED_CONCURRENCY, (text) => embedTextForRag(text));

  const rows = embeddings.map((vector, i) => {
    const text = chunks[i]!;
    const chunkId = `${doc.docId}:${i}`;

    const metadata: SystemKnowledgeVectorMetadata = {
      dataType: doc.dataType,
      accessLevel: doc.accessLevel,
      chunkId,
      text,
      docId: doc.docId,
    };

    if (doc.dataType === 'course' && doc.courseId) {
      metadata.courseId = doc.courseId;
    }
    if (doc.dataType === 'step' && doc.stepId) {
      metadata.stepId = doc.stepId;
      if (typeof doc.stepNumber === 'number') metadata.stepNumber = doc.stepNumber;
      if (doc.courseId) metadata.courseId = doc.courseId;
      if (doc.stationId) metadata.stationId = doc.stationId;
      if (doc.stationTitle) metadata.stationTitle = doc.stationTitle;
      if (typeof doc.stationOrder === 'number') metadata.stationOrder = doc.stationOrder;
    }

    return {
      id: systemKnowledgeVectorId(doc.docId, i),
      vector,
      metadata,
    };
  });

  await upsertSystemKnowledgeVectors(rows);

  return {
    chunkCount: chunks.length,
    vectorIds: rows.map((r) => r.id),
  };
}

/** מוחק את כל הווקטורים של מסמך לפי מספר chunks ידוע */
export async function deleteKnowledgeDocVectors(
  docId: string,
  chunkCount: number
): Promise<number> {
  if (chunkCount <= 0) return 0;
  const ids = systemKnowledgeVectorIdsForDoc(docId, chunkCount);
  return deleteSystemKnowledgeVectorsByIds(ids);
}
