'use client';

import { useCallback, useRef } from 'react';

type VerificationCodeInputProps = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

export const VERIFICATION_CODE_LENGTH = 8;

export function VerificationCodeInput({ value, onChange, disabled }: VerificationCodeInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(VERIFICATION_CODE_LENGTH, ' ').slice(0, VERIFICATION_CODE_LENGTH).split('');

  const setDigitAt = useCallback(
    (index: number, char: string) => {
      const next = digits.map((d, i) => (i === index ? char : d === ' ' ? '' : d));
      onChange(next.join('').replace(/\s/g, '').slice(0, VERIFICATION_CODE_LENGTH));
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
      if (index < VERIFICATION_CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
      return;
    }
    const pasted = cleaned.slice(0, VERIFICATION_CODE_LENGTH - index);
    const merged = [...digits.map((d) => (d === ' ' ? '' : d))];
    for (let i = 0; i < pasted.length; i++) {
      merged[index + i] = pasted[i]!;
    }
    onChange(merged.join('').slice(0, VERIFICATION_CODE_LENGTH));
    const focusIdx = Math.min(index + pasted.length, VERIFICATION_CODE_LENGTH - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div
      className="flex flex-row justify-center gap-[clamp(2px,1.2vw,0.5rem)] w-full max-w-full min-w-0 box-border px-1"
      dir="ltr"
      role="group"
      aria-label={`קוד אימות בן ${VERIFICATION_CODE_LENGTH} ספרות`}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData
          .getData('text')
          .replace(/\D/g, '')
          .slice(0, VERIFICATION_CODE_LENGTH);
        if (text) {
          onChange(text);
          inputsRef.current[Math.min(text.length, VERIFICATION_CODE_LENGTH) - 1]?.focus();
        }
      }}
    >
      {Array.from({ length: VERIFICATION_CODE_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={digits[i]?.trim() ? digits[i]!.trim() : ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={[
            'h-12 min-w-0 w-[clamp(1.6rem,9.5vw,2.25rem)] grow shrink rounded-xl text-center text-base sm:text-lg font-black',
            'onboarding-input-dark border-2 border-primary-500/35',
            'focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 outline-hidden transition-all',
            disabled ? 'opacity-50' : '',
          ].join(' ')}
          aria-label={`ספרה ${i + 1} מתוך ${VERIFICATION_CODE_LENGTH}`}
        />
      ))}
    </div>
  );
}