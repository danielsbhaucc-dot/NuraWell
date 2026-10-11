import { ISRAEL_CRISIS_RESOURCES } from '@/lib/safety/crisis-resources';

/** Fixed, deterministic safety card — shown whenever a crisis signal is detected (never AI-generated). */
export function CrisisResourcesCard() {
  const r = ISRAEL_CRISIS_RESOURCES;
  return (
    <section
      role="alert"
      aria-label="עזרה מיידית"
      className="mx-1 my-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-start text-rose-950 shadow-xs"
    >
      <p className="text-sm font-bold">לא צריך להתמודד עם זה לבד. יש מי שזמין עכשיו:</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        <li>
          <a className="font-bold underline" href={`tel:${r.eran.phone}`}>ער״ן – {r.eran.phone}</a> · {r.eran.description} · {r.eran.availability}
        </li>
        <li>
          <a className="font-bold underline" href="https://sahar.org.il" target="_blank" rel="noopener noreferrer">סה״ר</a> · צ׳אט תמיכה רגשית אנונימי ברשת
        </li>
        <li>
          <a className="font-bold underline" href={`tel:${r.medicalEmergency.phone}`}>מד״א – {r.medicalEmergency.phone}</a> · {r.medicalEmergency.description}
        </li>
        <li>
          <a className="font-bold underline" href={`tel:${r.policeEmergency.phone}`}>משטרה – {r.policeEmergency.phone}</a> · {r.policeEmergency.description}
        </li>
      </ul>
      <p className="mt-2 text-xs text-rose-900/80">
        בקשיים סביב אכילה (הקאות, צום, משלשלים) כדאי לפנות גם לרופא המשפחה או לקופת החולים — יש מרפאות ייעודיות להפרעות אכילה.
      </p>
    </section>
  );
}
