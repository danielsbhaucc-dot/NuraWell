import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type {
  ChallengeInterviewInsights,
  ChallengeInterviewTurn,
} from './content';
import { INTERVIEW_MIN_TURNS, INTERVIEW_OPENING } from './content';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

export type ChallengeInterviewResult = {
  reply: string;
  done: boolean;
  insights: ChallengeInterviewInsights | null;
};

function countUserTurns(messages: ChallengeInterviewTurn[]): number {
  return messages.filter((m) => m.role === 'user').length;
}

export async function runChallengeInterviewTurn(params: {
  messages: ChallengeInterviewTurn[];
  firstName: string;
  gender: 'male' | 'female' | null;
}): Promise<ChallengeInterviewResult> {
  const userTurns = countUserTurns(params.messages);
  const isOpening = params.messages.length === 0;

  if (isOpening) {
    return { reply: INTERVIEW_OPENING, done: false, insights: null };
  }

  const genderHint =
    params.gender === 'male' ? 'פנה אליו בלשון זכר'
    : params.gender === 'female' ? 'פני אליה בלשון נקבה'
    : 'פנה/י בלשון נייטרלית';

  const system = `אתה אלמוג, מנטור AI חם ואמפתי באתגר 14 יום של NuraWell.
${genderHint}. שם המשתמש: ${params.firstName}.

זה ריאיון פתיחה — לא ייעוץ רפואי. מטרה: להבין מוטיבציה, קשיים, מה הוביל להירשם, ואיך המשתמש מגדיר הצלחה (לא משקל).
שאל שאלה אחת בכל פעם. קצר (2-4 משפטים). עברית טבעית.
אחרי ${INTERVIEW_MIN_TURNS} תשובות מהמשתמש — סיים בחום והודה.

כשמסיים, הוסף בשורה נפרדה בדיוק:
---INSIGHTS---
{"motivation":"...","core_struggles":"...","success_definition":"...","language_baseline":"...","emotional_triggers":"...","registration_why":"..."}`;

  const history = params.messages
    .map((m) => `${m.role === 'user' ? 'משתמש' : 'אלמוג'}: ${m.content}`)
    .join('\n');

  const modelId = process.env.OPENROUTER_MODEL_FAST?.trim() || 'meta-llama/llama-4-maverick';

  const { text } = await generateText({
    model: openrouter(modelId),
    system,
    prompt: history,
    maxOutputTokens: 500,
    temperature: 0.7,
  });

  let reply = text.trim();
  let insights: ChallengeInterviewInsights | null = null;
  let done = false;

  const marker = '---INSIGHTS---';
  const idx = reply.indexOf(marker);
  if (idx >= 0) {
    done = true;
    const jsonPart = reply.slice(idx + marker.length).trim();
    reply = reply.slice(0, idx).trim();
    try {
      insights = JSON.parse(jsonPart) as ChallengeInterviewInsights;
    } catch {
      insights = { motivation: jsonPart.slice(0, 500) };
    }
  } else if (userTurns >= INTERVIEW_MIN_TURNS + 1) {
    done = true;
  }

  return { reply: reply || 'תודה על השיחה — בוא/י נתחיל!', done, insights };
}
