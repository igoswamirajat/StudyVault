import { getDb, type Quiz, type Resource } from "@/db/schema";
import { generateQuizAI } from "@/lib/ai.functions";
import { getOrCreateSummary } from "./notesService";

const FALLBACK = [
  {
    question: "What's the most useful first step when you couldn't review a resource recently?",
    options: ["Skip it entirely", "Re-read your summary note", "Delete it", "Restart from scratch"],
    correctIndex: 1,
    explanation: "Your summary note is your distilled understanding — re-reading it primes recall.",
  },
];

export async function generateQuizForResource(resource: Resource, opts?: { force?: boolean }): Promise<Quiz> {
  const db = getDb();
  if (!opts?.force) {
    const existing = await db.quizzes.where("resourceId").equals(resource.id).first();
    if (existing) return existing;
  }
  const summary = await getOrCreateSummary(resource);
  let questions: Quiz["questions"];
  let source: "ai" | "manual" = "ai";
  try {
    const result = await generateQuizAI({
      data: {
        title: resource.name,
        contentMarkdown: summary.contentMarkdown || resource.name,
        resourceType: resource.type,
        count: 5,
      },
    });
    questions = result.questions;
  } catch (err) {
    console.warn("AI quiz failed, using fallback", err);
    questions = FALLBACK;
    source = "manual";
  }
  const quiz: Quiz = { resourceId: resource.id, questions, generatedAt: Date.now(), source };
  // Replace any existing quiz for this resource
  await db.quizzes.where("resourceId").equals(resource.id).delete();
  const id = await db.quizzes.add(quiz);
  return { ...quiz, id: id as number };
}

/** Back-compat alias used by older callers. */
export async function generateQuiz(resourceId: string): Promise<Quiz> {
  const resource = await getDb().resources.get(resourceId);
  if (!resource) throw new Error("Resource not found");
  return generateQuizForResource(resource);
}

