/** The paper emergency card: exactly 10 numbered lines, one recovery code each (print + download share this). */
export function emergencyCardLines(codes: string[]): string[] {
  if (codes.length !== 10) throw new Error('emergency card needs exactly 10 codes');
  return codes.map((c, i) => `${String(i + 1).padStart(2, '0')}. ${c}`);
}

export function emergencyCardText(codes: string[], issuedAt: Date): string {
  return [
    'NuraWell · כרטיס חירום לפאנל הניהול',
    `הונפק: ${issuedAt.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
    'כל קוד עובד פעם אחת. יצירת קודים חדשים מבטלת את כולם.',
    '',
    ...emergencyCardLines(codes),
    '',
    'שמרו במקום פיזי בטוח. לא בצילום מסך ולא בענן.',
  ].join('\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export function emergencyCardHtml(codes: string[], issuedAt: Date): string {
  const rows = emergencyCardLines(codes).map((l) => `<li>${esc(l)}<span class="box"></span></li>`).join('');
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>כרטיס חירום</title><style>
body{font-family:system-ui,sans-serif;margin:24px;color:#0f3d2e}h1{font-size:20px;margin:0 0 4px}p{margin:2px 0;font-size:12px}
ol{list-style:none;padding:0;margin:16px 0;border:2px solid #0f3d2e;border-radius:12px}
li{direction:ltr;font:600 18px ui-monospace,monospace;padding:10px 16px;border-bottom:1px dashed #94a3b8;display:flex;justify-content:space-between}
li:last-child{border-bottom:0}.box{width:16px;height:16px;border:1.5px solid #0f3d2e;border-radius:3px}
</style></head><body><h1>NuraWell · כרטיס חירום לפאנל הניהול</h1><p>הונפק: ${esc(issuedAt.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }))}</p>
<p>כל קוד עובד פעם אחת. סמנו ✓ ליד קוד שנוצל. יצירת קודים חדשים מבטלת את כולם.</p><ol>${rows}</ol><p>שמרו במקום פיזי בטוח.</p></body></html>`;
}
