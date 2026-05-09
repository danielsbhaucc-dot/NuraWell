import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

export function jsonZodError(error: ZodError, message = 'Invalid request body') {
  return NextResponse.json({ error: message, details: error.flatten() }, { status: 400 });
}
