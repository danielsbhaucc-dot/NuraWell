'use client';

import { useCallback, useRef } from 'react';

type VerificationCodeInputProps = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

const LENGTH = 6;

export function VerificationCodeInput({ value, onChange, disabled }: VerificationCodeInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');

  const setDigitAt = useCallback(
    (index: number, char: string) => {
      const next = digits.map((d, i) => (i === index ? char : d === ' ' ? '' : d));
      onChange(next.join('').replace(/\s/g, '').slice(0, LENGTH));
    },
    [digits, onChange]
  );

  const handleChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setDigitAt(index, '');
      return;
    }
    if (cleaned.length === 1) {
      setDigitAt(index, cleaned);
      if (index < LENGTH - 1) inputsRef.current[index + 1]?.focus();
      return;
    }
    const pasted = cleaned.slice(0, LENGTH - index);
    const merged = [...digits.map((d) => (d === ' ' ? '' : d))];
    for (let i = 0; i < pasted.length; i++) {
      merged[index + i] = pasted[i]!;
    }
    onChange(merged.join('').slice(0, LENGTH));
    const focusIdx = Math.min(index + pasted.length, LENGTH - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div
      className="flex flex-row-reverse justify-center gap-2 sm:gap-2.5"
      dir="ltr"
      role="group"
      aria-label="קוד אימות בן 6 ספרות"
    >
      {Array.from({ length: LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          value={digits[i]?.trim() ? digits[i]!.trim() : ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={[
            'w-11 h-14 sm:w-12 sm:h-[3.25rem] rounded-xl text-center text-xl font-black',
            'onboarding-input-dark border-2 border-emerald-500/35',
            'focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 outline-none transition-all',
            disabled ? 'opacity-50' : '',
          ].join(' ')}
          aria-label={`ספרה ${i + 1} מתוך ${LENGTH}`}
        />
      ))}
    </div>
  );
}