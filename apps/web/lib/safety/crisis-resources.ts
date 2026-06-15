export type CrisisResource = {
  name: string;
  phone: string;
  description: string;
  availability: string;
};

export const ISRAEL_CRISIS_RESOURCES = {
  eran: {
    name: 'ערן',
    phone: '1201',
    description: 'עזרה ראשונה נפשית, חינם ואנונימית',
    availability: '24/7',
  },
  medicalEmergency: {
    name: 'מדא',
    phone: '101',
    description: 'חירום רפואי מיידי',
    availability: '24/7',
  },
  policeEmergency: {
    name: 'משטרה',
    phone: '100',
    description: 'סכנה מיידית או חשש לפגיעה',
    availability: '24/7',
  },
} as const satisfies Record<string, CrisisResource>;

export const CRISIS_ESCALATION_MESSAGE =
  'אני שומע אותך, ואני לא רוצה שתהיה עם זה לבד עכשיו. אם יש סכנה מיידית, התקשר/י עכשיו ל-101 או 100. אפשר גם לפנות לערן ב-1201, עזרה ראשונה נפשית 24/7, חינם ואנונימית.';
