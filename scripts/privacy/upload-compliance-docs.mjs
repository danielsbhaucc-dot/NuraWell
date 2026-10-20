#!/usr/bin/env node
/** Upload /workspace/compliance/{01..09}*.pdf|docx into owner_compliance_docs (service-role-only table). Never commit the files.
 *  Re-uploads are served from the DB copy (storage_key cleared) until moved to the legal bucket again. */
import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
const REF = process.env.SUPABASE_PROJECT_REF || 'csxsxvzowlswahmfcsjk';
const DIR = process.argv[2] || '/workspace/compliance';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN missing'); process.exit(2); }
const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
for (const f of readdirSync(DIR).filter((x) => /^0[1-9]-[a-z-]+\.(pdf|docx)$/.test(x)).sort()) {
  const buf = readFileSync(`${DIR}/${f}`);
  const ext = f.split('.').pop();
  const q = `insert into public.owner_compliance_docs(slug,title,mime,content,sha256,sensitive,updated_at) values ('${f}','${f}','${MIME[ext]}',decode('${buf.toString('hex')}','hex'),'${createHash('sha256').update(buf).digest('hex')}',${f.startsWith('06-')},now()) on conflict (slug) do update set content=excluded.content, storage_key=null, sha256=excluded.sha256, mime=excluded.mime, updated_at=now()`;
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
  console.log(f, r.status);
}
