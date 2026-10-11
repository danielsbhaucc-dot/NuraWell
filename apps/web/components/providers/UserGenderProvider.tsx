'use client';

import { createContext, useContext } from 'react';
import { gx, type UserGender } from '@/lib/i18n/gender';

const Ctx = createContext<UserGender>(null);

export function UserGenderProvider({ gender, children }: { gender: UserGender; children: React.ReactNode }) {
  return <Ctx.Provider value={gender}>{children}</Ctx.Provider>;
}

/** `const g = useGx(); g({ m: 'לחץ', f: 'לחצי', n: 'לחצו' })` */
export function useGx() {
  const gender = useContext(Ctx);
  return (forms: { m: string; f: string; n: string }) => gx(gender, forms);
}
