import { getDb, type Quiz, type Resource } from "@/db/schema";
import { aiGenerateQuiz } from "./aiService";
import { buildResourceContext } from "./aiContext";
import { notify } from "@/lib/notify";


export async function generateQuizForResource(
  resource: Resource,
  opts?: { force?: boolean; count?: number },
): Promise<Quiz> {
  const db = getDb();
  if (!opts?.force) {
    const existing = await db.quizzes.where("resourceId").equals(resource.id).first();
    if (existing) return existing;
  }
  const context = await buildResourceContext(resource, {
    includeSiblings: false,
  });
  let questions: Quiz["questions"];
  let source: "ai" | "manual" = "ai";
  const result = await aiGenerateQuiz(resource.name, context, resource.type, opts?.count ?? 5);
  questions = result.questions;

  const quiz: Quiz = { resourceId: resource.id, questions, generatedAt: Date.now(), source: "ai" };
  // Replace any existing quiz for this resource atomically — if the delete
  // succeeded but the add failed (bad shape, quota, tab closed), the user would
  // otherwise be left with no quiz at all.
  const id = await db.transaction("rw", db.quizzes, async () => {
    await db.quizzes.where("resourceId").equals(resource.id).delete();
    return db.quizzes.add(quiz);
  });
  return { ...quiz, id: id as number };
}

/** Back-compat alias used by older callers. */
export async function generateQuiz(resourceId: string): Promise<Quiz> {
  const resource = await getDb().resources.get(resourceId);
  if (!resource) throw new Error("Resource not found");
  return generateQuizForResource(resource);
}

export async function createFlashcardsFromMistakes(quiz: Quiz, answers: number[]): Promise<void> {
  const db = getDb();
  const mistakes = quiz.questions.filter((q, i) => answers[i] !== q.correctIndex);
  if (mistakes.length === 0) return;

  const cards = mistakes.map((q) => ({
    id: crypto.randomUUID(),
    resourceId: quiz.resourceId,
    front: q.question,
    back: `Correct Answer: ${q.options[q.correctIndex]}\n\nExplanation: ${q.explanation}`,
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    dueAt: Date.now(),
    lastReviewedAt: null,
    createdAt: Date.now(),
    source: "ai" as const,
  }));

  await db.flashcards.bulkAdd(cards);
  notify.success(`Created ${cards.length} flashcards from your mistakes.`);
}
