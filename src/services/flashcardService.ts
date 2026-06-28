import { nanoid } from "nanoid";
import { getDb, type FlashcardRow } from "@/db/schema";

export type Flashcard = FlashcardRow;


export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * SuperMemo 2 algorithm.
 * grade: 0-2 = forgot (reset), 3-5 = recalled.
 */
export function sm2(card: Flashcard, grade: Grade): Flashcard {
  let { ease, interval, repetitions } = card;
  if (grade < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ease);
    repetitions += 1;
    ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  }
  const dueAt = Date.now() + interval * 24 * 60 * 60 * 1000;
  return {
    ...card,
    ease,
    interval,
    repetitions,
    dueAt,
    lastReviewedAt: Date.now(),
  };
}

export async function addFlashcards(
  resourceId: string | null,
  cards: Array<{ front: string; back: string; hint?: string }>,
  source: "ai" | "manual" = "ai",
): Promise<Flashcard[]> {
  const db = getDb();
  const now = Date.now();
  const records: Flashcard[] = cards.map((c) => ({
    id: nanoid(),
    resourceId,
    front: c.front,
    back: c.back,
    hint: c.hint,
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    dueAt: now, // due immediately on creation
    lastReviewedAt: null,
    createdAt: now,
    source,
  }));
  await db.flashcards.bulkPut(records);
  return records;
}

export async function listFlashcardsForResource(resourceId: string): Promise<Flashcard[]> {
  return getDb().flashcards.where("resourceId").equals(resourceId).toArray();
}

export async function getDueFlashcards(resourceId?: string): Promise<Flashcard[]> {
  const db = getDb();
  const now = Date.now();
  const all = resourceId
    ? await db.flashcards.where("resourceId").equals(resourceId).toArray()
    : await db.flashcards.toArray();
  return all.filter((c) => c.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

export async function gradeFlashcard(id: string, grade: Grade): Promise<Flashcard | null> {
  const db = getDb();
  const card = await db.flashcards.get(id);
  if (!card) return null;
  const next = sm2(card, grade);
  await db.flashcards.put(next);
  return next;
}

export async function deleteFlashcard(id: string): Promise<void> {
  await getDb().flashcards.delete(id);
}

export async function countFlashcardStats() {
  const db = getDb();
  const all = await db.flashcards.toArray();
  const now = Date.now();
  return {
    total: all.length,
    due: all.filter((c) => c.dueAt <= now).length,
    learned: all.filter((c) => c.repetitions >= 2).length,
  };
}
