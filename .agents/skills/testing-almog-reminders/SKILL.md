---
name: testing-almog-reminders
description: Verify Almog reminder/commitment extraction end-to-end (correct local→UTC time, natural notification copy, late-night date handling, and not creating reminders from empathy/questions). Use when testing changes under apps/web/lib/ai/almog-commitments/.
---

# Testing Almog reminder extraction

The reminder logic lives in the **background extraction** layer, not the chat stream:
`apps/web/lib/ai/almog-commitments/extract-commitments.ts` (`extractAlmogCommitments`).
It calls the cheap model (`meta-llama/llama-4-scout` via OpenRouter, env `ALMOG_COMMITMENTS_MODEL`)
and runs the deterministic time-conversion + reminder-detection code. Its return object is the
best assertion surface — no DB or login required.

## Why UI E2E is hard (design your test around this)
- A reminder created in chat is written to `scheduled_reminders` with a **future** `fire_at`.
- It only becomes a visible notification card after `fire_at` passes AND the CRON (every ~30 min)
  or the user-active drain (`POST /api/v1/ai/sync-reminders`) delivers it.
- So you usually cannot watch a reminder fire live. Prefer asserting on the extraction output
  object directly. If you must do UI, you need a preview login + Supabase access to inspect
  `scheduled_reminders`, and possibly to trigger the drain endpoint.

## Fast, reliable test: drive the extraction directly
Write a throwaway `tsx` script in `apps/web/` (do NOT commit it) that imports
`extractAlmogCommitments` and `israelParts` (from `./lib/ai/almog-commitments/time`), feeds
realistic `{ userMessage, assistantMessage, now }`, and asserts on the result. Run with
`cd apps/web && npx --yes tsx your-script.mts`.

Key points:
- `extractAlmogCommitments` accepts a `now: Date` param — inject a fixed time to test
  time-of-day-dependent behavior (e.g. after-midnight date handling) deterministically.
- Israel is **UTC+3 in summer (DST), UTC+2 in winter**. Convert `fire_at_iso` back through
  `israelParts(new Date(iso))` and assert on `{day, hour, minute}` rather than hard-coding a Z time.
- Run at low temperature; Llama output is stable but not byte-identical.

## Assertions that distinguish working vs broken
- **Correct time (the classic `00:30`→`03:30` bug):** ask for a specific clock time; assert the
  Israel-local hour/minute of `fire_at_iso` equals what was asked (a +3h/+2h offset = broken).
- **Natural copy:** `reminders[0].notify_text` is non-empty, doesn't start with `תזכורת`, and
  differs from the raw `what`.
- **Late-night date:** with `now` = ~00:30 IL, "remind me tomorrow morning at 7" should resolve to
  the **coming** morning (same calendar date), not the next day.
- **No over-eager reminders (bug class):** empathy that merely mentions reminders, or a clarifying
  question ("מתי אתה רוצה שאזכיר לך?"), must yield `reminders === []`. Always include a positive
  control (a real "אזכיר לך מחר ב-8") to confirm legit reminders still fire.

## Devin Secrets Needed
- `OPENROUTER_API_KEY` — required to call the real Llama 4 model. The extraction silently returns
  nothing useful without it. (Saved at org scope.)
- Optional, only for full UI E2E: a preview/staging login + Supabase access to read
  `scheduled_reminders` and trigger delivery.

## CI note
`DeepSource: JavaScript` has been **failing on `main`** (repo-wide, "Blocking issues or failing
metrics found") and does not block merges here. Don't treat it as a regression without first
checking the base branch. The GitHub Actions checks (test, CodeQL, gitleaks, secrets) are the
signal that matters.
