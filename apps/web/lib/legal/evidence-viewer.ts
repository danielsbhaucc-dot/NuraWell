import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Single self-contained offline viewer (one HTML file inside every evidence bundle).
 * Opens by double-click, no network: summary, timeline, every record with its images, hashes and
 * signatures, and IN-BROWSER verification (WebCrypto SHA-256 + Ed25519) with Hebrew status.
 * Nothing in it is trusted blindly: it recomputes from the embedded original bytes.
 */
export type ViewerImage = { name: string; mime: string; bytes: Uint8Array; expected_sha256: string | null; caption?: string };
export type ViewerRecord = {
  n: number; title: string; at: string; tone: 'good' | 'bad' | 'info'; reference: string;
  payload_json: string; record_hash: string; prev_hash: string; signature: string; key_id: string | null;
  images: ViewerImage[]; fields: Array<[string, string]>; server_checks: Array<{ label: string; ok: boolean | null }>; text_lines?: string[];
};
export type ViewerModel = {
  kind: 'consent' | 'media'; case_ref: string; generated_at: string; generated_by: string; title: string;
  subject: Array<[string, string]>; overall_ok: boolean; keys: Array<{ key_id: string; pem: string; status: string }>;
  records: ViewerRecord[]; notes?: string[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const fmt = (iso: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso));

async function fontFace(): Promise<string> {
  const dir = path.join(process.cwd(), 'lib/legal/fonts');
  const load = async (f: string) => { try { return b64(await readFile(path.join(dir, f))); } catch { return null; } };
  const [ar, ab, rb] = await Promise.all([load('Assistant-Regular.ttf'), load('Assistant-Bold.ttf'), load('Rubik-Bold.ttf')]);
  return [ar && `@font-face{font-family:A;font-weight:400;src:url(data:font/ttf;base64,${ar})}`, ab && `@font-face{font-family:A;font-weight:700;src:url(data:font/ttf;base64,${ab})}`, rb && `@font-face{font-family:R;font-weight:700;src:url(data:font/ttf;base64,${rb})}`].filter(Boolean).join('');
}

export async function buildEvidenceViewer(m: ViewerModel): Promise<string> {
  const data = {
    keys: m.keys,
    records: m.records.map((r) => ({ n: r.n, payload: r.payload_json, hash: r.record_hash, prev: r.prev_hash, sig: r.signature, key_id: r.key_id, imgs: r.images.map((i) => ({ name: i.name, sha: i.expected_sha256 })) })),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const rec = (r: ViewerRecord) => `
  <article class="rec" id="r${r.n}" data-n="${r.n}">
    <div class="dot ${r.tone}"></div>
    <header class="rh">
      <div><p class="eyebrow">${esc(fmt(r.at))} · <span dir="ltr">${esc(r.reference)}</span></p><h3>${r.n}. ${esc(r.title)}</h3></div>
      <span class="st pending" data-status="${r.n}">בודק…</span>
    </header>
    <div class="checks" data-checks="${r.n}">
      <span class="ck" data-k="hash">גיבוב הרשומה</span><span class="ck" data-k="chain">שרשרת</span><span class="ck" data-k="sig">חתימה דיגיטלית</span>${r.images.length ? '<span class="ck" data-k="img">צילום</span>' : ''}
      ${r.server_checks.map((c) => `<span class="ck srv ${c.ok === null ? 'na' : c.ok ? 'ok' : 'bad'}" title="נבדק בשרת בזמן ההפקה">${esc(c.label)}</span>`).join('')}
    </div>
    <div class="grid">
      <div class="imgs">${r.images.length ? r.images.map((i, k) => `<figure><img alt="${esc(i.caption ?? i.name)}" src="data:${i.mime};base64,${b64(i.bytes)}" data-img="${r.n}:${k}"><figcaption>${esc(i.caption ?? i.name)} <span class="imgst" data-imgst="${r.n}:${k}"></span></figcaption></figure>`).join('') : '<p class="muted">אין צילום לרשומה זו</p>'}</div>
      <dl>${r.fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        <div><dt>גיבוב הרשומה (SHA-256)</dt><dd class="mono" dir="ltr">${esc(r.record_hash)}</dd></div>
        <div><dt>מפתח החתימה</dt><dd class="mono" dir="ltr">${esc(r.key_id ?? '—')}</dd></div>
      </dl>
    </div>
    ${r.text_lines?.length ? `<details><summary>הנוסח שהוצג</summary><div class="txt">${r.text_lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div></details>` : ''}
    <details><summary>הרשומה החתומה המלאה</summary><pre dir="ltr">${esc(r.payload_json)}</pre></details>
  </article>`;

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>${esc(m.title)} · ${esc(m.case_ref)}</title>
<style>${await fontFace()}
*{box-sizing:border-box;margin:0}body{font:400 15px/1.55 A,'Segoe UI',Arial,sans-serif;color:#10322c;min-height:100vh;background:radial-gradient(900px 600px at 90% -10%,rgba(20,184,166,.32),transparent 60%),radial-gradient(700px 500px at -5% 35%,rgba(217,119,6,.18),transparent 60%),linear-gradient(165deg,#d6ece5,#e6e0cc 60%,#d3e8e1)}
h1,h2,h3{font-family:R,A,sans-serif;font-weight:700}.wrap{max-width:1120px;margin:0 auto;padding:20px}
.hero{border-radius:30px;padding:28px;color:#f1e6c8;background:linear-gradient(135deg,#0c3a33,#115147 60%,#0f3d36);box-shadow:0 24px 60px rgba(6,50,42,.35);position:relative;overflow:hidden}
.hero:after{content:"";position:absolute;inset:auto -60px -80px auto;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(212,166,74,.45),transparent 70%)}
.hero h1{font-size:28px;color:#f7ecd0}.hero .eyebrow{color:#d4a64a}.hero .muted{color:#b9d6cf}
.verdict{margin-top:18px;display:inline-flex;align-items:center;gap:10px;padding:12px 18px;border-radius:18px;font:700 17px R,A,sans-serif;background:rgba(255,255,255,.08);border:1px solid rgba(212,166,74,.4)}
.verdict.ok{background:rgba(16,185,129,.18);border-color:rgba(110,231,183,.5);color:#d1fae5}.verdict.bad{background:rgba(244,63,94,.18);border-color:rgba(253,164,175,.5);color:#ffe4e6}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}
.g{background:rgba(236,247,243,.55);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.5);border-radius:22px;padding:16px;box-shadow:0 12px 34px rgba(6,60,50,.1)}
.g dt,.eyebrow{font:700 12px A,sans-serif;color:#b45309;letter-spacing:.02em}.g dd{font-weight:700;word-break:break-word}
.muted{color:#55736c;font-size:13px}.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}
h2{margin:26px 4px 10px;font-size:19px}
.tl{position:relative;padding-right:26px}.tl:before{content:"";position:absolute;right:8px;top:6px;bottom:6px;width:3px;border-radius:3px;background:linear-gradient(#d4a64a,#0f766e)}
.rec{position:relative;margin-bottom:16px;background:rgba(236,247,243,.6);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.55);border-radius:24px;padding:18px;box-shadow:0 14px 36px rgba(6,60,50,.1)}
.dot{position:absolute;right:-25px;top:24px;width:16px;height:16px;border-radius:50%;border:3px solid #e6efe9}.dot.good{background:#059669}.dot.bad{background:#e11d48}.dot.info{background:#0d9488}
.rh{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.rh h3{font-size:17px}
.st{flex:none;padding:6px 14px;border-radius:999px;font:700 13px R,A,sans-serif;border:1px solid}.st.pending{color:#55736c;border-color:#b7cbc4}.st.ok{color:#065f46;background:rgba(16,185,129,.14);border-color:rgba(5,150,105,.4)}.st.bad{color:#9f1239;background:rgba(244,63,94,.12);border-color:rgba(225,29,72,.4)}
.checks{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.ck{font:700 12px A,sans-serif;padding:3px 10px;border-radius:999px;border:1px solid #b7cbc4;color:#55736c}.ck.ok{color:#065f46;border-color:rgba(5,150,105,.4);background:rgba(16,185,129,.12)}.ck.ok:before{content:"✓ "}.ck.bad{color:#9f1239;border-color:rgba(225,29,72,.35);background:rgba(244,63,94,.1)}.ck.bad:before{content:"✗ "}.ck.na{opacity:.6}.ck.srv{border-style:dashed}
.grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px}@media(max-width:760px){.grid{grid-template-columns:1fr}.hero{padding:20px;border-radius:24px}.hero h1{font-size:22px}.wrap{padding:12px}}
.imgs{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}figure{flex:0 0 auto;max-width:100%;border-radius:16px;overflow:hidden;background:rgba(15,61,54,.08);border:1px solid rgba(15,61,54,.12)}figure img{display:block;max-height:560px;max-width:min(100%,420px);cursor:zoom-in}figcaption{font-size:12px;padding:6px 10px;color:#3f5f58}
dl{display:grid;gap:8px;align-content:start}dl div{background:rgba(255,255,255,.28);border-radius:12px;padding:8px 12px}dl dt{font:700 11.5px A,sans-serif;color:#55736c}dl dd{font-size:14px;word-break:break-word}
details{margin-top:10px;background:rgba(255,255,255,.25);border-radius:14px;padding:10px 14px}summary{cursor:pointer;font-weight:700}pre{white-space:pre-wrap;word-break:break-all;font:12px ui-monospace,Menlo,monospace;margin-top:8px;max-height:320px;overflow:auto}.txt p{margin:4px 0}
.zoom{position:fixed;inset:0;background:rgba(6,30,26,.85);display:none;align-items:center;justify-content:center;padding:20px;z-index:9}.zoom.on{display:flex}.zoom img{max-width:100%;max-height:100%;border-radius:12px}
.how{font-size:13px}.how li{margin:4px 18px 4px 0}
@media print{.zoom,details{display:none}body{background:#f4f1e6}}
</style></head><body><div class="wrap">
<section class="hero">
  <p class="eyebrow">${m.kind === 'consent' ? 'תיק ראיות · הסכמה למידע בריאותי' : 'תיק ראיות · מקור וזכויות של קובץ'}</p>
  <h1>${esc(m.title)}</h1>
  <p class="muted">מספר תיק <span dir="ltr">${esc(m.case_ref)}</span> · הופק ${esc(fmt(m.generated_at))} (שעון ישראל) · ${esc(m.generated_by)}</p>
  <div class="verdict" id="verdict">בודק את כל הרשומות בדפדפן…</div>
</section>
<div class="cards">${m.subject.map(([k, v]) => `<div class="g"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}<div class="g"><dt>רשומות</dt><dd>${m.records.length}</dd></div></div>
<h2>ציר זמן</h2>
<div class="tl">${m.records.map(rec).join('')}</div>
<h2>איך הבדיקה נעשית</h2>
<div class="g how"><ul>
<li><b>גיבוב הרשומה:</b> הדפדפן מחשב SHA-256 של הרשומה המקורית שבקובץ ומשווה לגיבוב שנחתם.</li>
<li><b>שרשרת:</b> כל רשומה מצביעה על הגיבוב של הקודמת, כך שאי אפשר להוסיף, למחוק או להחליף רשומה בלי שזה ייראה.</li>
<li><b>חתימה דיגיטלית:</b> נבדקת מול המפתח הציבורי (Ed25519) שמוטמע כאן ומפורסם גם באתר.</li>
<li><b>צילום:</b> טביעת האצבע של כל תמונה מחושבת מחדש ומושווית לזו שנחתמה ברשומה.</li>
<li>תוויות עם מסגרת מקווקוות (חותמת זמן, עיגון ציבורי) נבדקו בשרת בזמן ההפקה; ההוכחות עצמן נמצאות בתיק לבדיקה עצמאית לפי VERIFY.txt.</li>
${(m.notes ?? []).map((n) => `<li>${esc(n)}</li>`).join('')}
</ul></div>
<p class="muted" style="margin:18px 4px">הקובץ הזה עובד בלי אינטרנט ולא שולח שום מידע לשום מקום.</p>
</div>
<div class="zoom" id="zoom"><img alt=""></div>
<script type="application/json" id="data">${json}</script>
<script>
(async()=>{
const D=JSON.parse(document.getElementById('data').textContent);
const enc=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async u8=>hex(await crypto.subtle.digest('SHA-256',u8));
const pemToDer=p=>Uint8Array.from(atob(p.replace(/-----[^-]+-----/g,'').replace(/\\s+/g,'')),c=>c.charCodeAt(0));
const b64u8=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let keys=[];let edOk=true;
for(const k of D.keys){try{keys.push({id:k.key_id,key:await crypto.subtle.importKey('spki',pemToDer(k.pem),{name:'Ed25519'},false,['verify'])});}catch(e){edOk=false;}}
const set=(n,k,ok)=>{const el=document.querySelector('[data-checks="'+n+'"] [data-k="'+k+'"]');if(el){el.classList.add(ok===null?'na':ok?'ok':'bad');}};
let all=true;let prevHash=null;
for(const r of D.records){
  let ok=true;
  const h=await sha(enc.encode(r.payload));const hOk=h===r.hash;set(r.n,'hash',hOk);ok=ok&&hOk;
  let p={};try{p=JSON.parse(r.payload);}catch(e){}
  const claimed=p.prev_hash??r.prev;const cOk=prevHash===null?true:claimed===prevHash;set(r.n,'chain',cOk);ok=ok&&cOk;prevHash=r.hash;
  let sOk=null;
  if(keys.length){sOk=false;const cand=[...keys.filter(k=>k.id===r.key_id),...keys.filter(k=>k.id!==r.key_id)];for(const k of cand){try{if(await crypto.subtle.verify({name:'Ed25519'},k.key,b64u8(r.sig),enc.encode(r.hash))){sOk=true;break;}}catch(e){}}}
  set(r.n,'sig',sOk);if(sOk===false)ok=false;
  if(r.imgs.length){let iOk=true;for(let i=0;i<r.imgs.length;i++){const img=document.querySelector('[data-img="'+r.n+':'+i+'"]');const st=document.querySelector('[data-imgst="'+r.n+':'+i+'"]');try{const u8=b64u8(img.src.split(',')[1]);const s=await sha(u8);const good=!r.imgs[i].sha||s===r.imgs[i].sha;iOk=iOk&&good;if(st)st.textContent=good?'· תקין':'· לא תקין';}catch(e){iOk=false;}}set(r.n,'img',iOk);ok=ok&&iOk;}
  const st=document.querySelector('[data-status="'+r.n+'"]');st.className='st '+(ok?'ok':'bad');st.textContent=ok?(sOk===null?'תקין (בלי בדיקת חתימה)':'תקין'):'לא תקין';
  all=all&&ok;
}
const v=document.getElementById('verdict');
v.className='verdict '+(all?'ok':'bad');
v.textContent=all?('✓ כל '+D.records.length+' הרשומות תקינות: גיבוב, שרשרת'+(edOk&&keys.length?', חתימה':'')+' וצילומים'):'✗ נמצאה רשומה לא תקינה. הפירוט מסומן באדום.';
if(!edOk||!keys.length){const n=document.createElement('p');n.className='muted';n.style.marginTop='8px';n.textContent='הדפדפן הזה לא תומך בבדיקת חתימות Ed25519. גיבובים, שרשרת וצילומים נבדקו; לבדיקת חתימה פותחים בדפדפן עדכני או לפי VERIFY.txt.';v.after(n);}
})();
const z=document.getElementById('zoom');document.querySelectorAll('figure img').forEach(i=>i.addEventListener('click',()=>{z.firstElementChild.src=i.src;z.classList.add('on');}));z.addEventListener('click',()=>z.classList.remove('on'));
</script></body></html>`;
}
