import { getDb, type Quiz, type Resource } from "@/db/schema";
import { aiGenerateQuiz } from "./aiService";
import { buildResourceContext, gatherResourceMedia } from "./aiContext";

const FALLBACK = [
  {
    question: "What's the most useful first step when you couldn't review a resource recently?",
    options: ["Skip it entirely", "Re-read your summary note", "Delete it", "Restart from scratch"],
    correctIndex: 1,
    explanation: "Your summary note is your distilled understanding — re-reading it primes recall.",
  },
];

export async function generateQuizForResource(
  resource: Resource,
  opts?: { force?: boolean },
): Promise<Quiz> {
  const db = getDb();
  if (!opts?.force) {
    const existing = await db.quizzes.where("resourceId").equals(resource.id).first();
    if (existing) return existing;
  }
  const context = await buildResourceContext(resource, {
    maxChars: 8000,
    includeSiblings: false,
  });
  const media = await gatherResourceMedia(resource);
  let questions: Quiz["questions"];
  let source: "ai" | "manual" = "ai";
  try {
    const result = await aiGenerateQuiz(resource.name, context, resource.type, 5, media);
    questions = result.questions;
  } catch (err) {
    console.warn("AI quiz failed, using fallback", err);
    questions = FALLBACK;
    source = "manual";
  }
  const quiz: Quiz = { resourceId: resource.id, questions, generatedAt: Date.now(), source };
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
