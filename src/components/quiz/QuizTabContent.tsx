import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, RefreshCw, Sparkles, FileText, Layers } from "lucide-react";
import { generateQuizForResource, createFlashcardsFromMistakes } from "@/services/quizService";
import { isAiConfigured } from "@/services/aiService";
import type { Quiz } from "@/db/schema";
import { getDb } from "@/db/schema";
import { getOrCreateProgress } from "@/services/progressService";
import { createNote } from "@/services/notesService";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  resourceId: string;
}

export function QuizTabContent({ resourceId }: Props) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [showCountDialog, setShowCountDialog] = useState(false);
  const [selectedCount, setSelectedCount] = useState(5);

  async function loadDbOnly() {
    setLoading(true);
    try {
      const q = await getDb().quizzes.where("resourceId").equals(resourceId).first();
      if (q) {
        setQuiz(q);
        setIdx(0);
        setAnswers([]);
        setDone(false);
      } else {
        setQuiz(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function generateNewQuiz(count = 5) {
    setLoading(true);
    try {
      const resource = await getDb().resources.get(resourceId);
      if (!resource) throw new Error("Resource not found");
      const q = await generateQuizForResource(resource, { force: true, count });
      setQuiz(q);
      setIdx(0);
      setAnswers([]);
      setDone(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate AI quiz");
      if (!quiz) setQuiz(null); // Keep old quiz if it failed to regenerate
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDbOnly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

  async function handleGenerateClick() {
    const hasAi = await isAiConfigured();
    if (!hasAi) {
      toast.error("Configure your AI provider in Settings → AI first");
      return;
    }
    setShowCountDialog(true);
  }

  function pick(n: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = n;
      return next;
    });
  }

  async function finish() {
    if (!quiz) return;
    const score = quiz.questions.reduce(
      (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
      0,
    );
    const p = await getOrCreateProgress(resourceId);
    p.quizScore = Math.round((score / quiz.questions.length) * 100);
    await getDb().progress.put(p);
    setDone(true);
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-sm">Generating AI quiz…</p>
      </div>
    );
  }

  if (!quiz || quiz.questions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground p-6">
        <Sparkles className="size-10 opacity-50" />
        <div>
          <p className="text-base font-medium text-foreground">Ready for a Quiz?</p>
          <p className="text-sm mt-1 max-w-sm">
            Generate an AI quiz based on your summary and notes to test your understanding.
          </p>
        </div>
        <Button onClick={handleGenerateClick} className="mt-2">
          <Sparkles className="mr-2 size-4" /> Generate Quiz
        </Button>

        {showCountDialog && (
          <Dialog open={showCountDialog} onOpenChange={setShowCountDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>How many questions?</DialogTitle>
                <DialogDescription>
                  Choose how in-depth you want this quiz to be.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-5 gap-2 py-4">
                {[3, 5, 8, 10, 15].map((n) => (
                  <Button
                    key={n}
                    variant={selectedCount === n ? "default" : "outline"}
                    onClick={() => setSelectedCount(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowCountDialog(false)}>Cancel</Button>
                <Button onClick={() => {
                  setShowCountDialog(false);
                  void generateNewQuiz(selectedCount);
                }}>
                  Start Quiz
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {done ? (
        <ResultView
          quiz={quiz}
          answers={answers}
          onRetry={() => {
            setAnswers([]);
            setIdx(0);
            setDone(false);
          }}
          onRegenerate={handleGenerateClick}
        />
      ) : (
        <QuestionView
          quiz={quiz}
          idx={idx}
          answer={answers[idx]}
          onPick={pick}
          onNext={() => (idx + 1 < quiz.questions.length ? setIdx(idx + 1) : finish())}
          onSkip={() => (idx + 1 < quiz.questions.length ? setIdx(idx + 1) : finish())}
        />
      )}

      {showCountDialog && (
        <Dialog open={showCountDialog} onOpenChange={setShowCountDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>How many questions?</DialogTitle>
              <DialogDescription>
                Choose how in-depth you want the new quiz to be.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-5 gap-2 py-4">
              {[3, 5, 8, 10, 15].map((n) => (
                <Button
                  key={n}
                  variant={selectedCount === n ? "default" : "outline"}
                  onClick={() => setSelectedCount(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCountDialog(false)}>Cancel</Button>
              <Button onClick={() => {
                setShowCountDialog(false);
                void generateNewQuiz(selectedCount);
              }}>
                Start Quiz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function QuestionView({
  quiz,
  idx,
  answer,
  onPick,
  onNext,
  onSkip,
}: {
  quiz: Quiz;
  idx: number;
  answer: number | undefined;
  onPick: (n: number) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const q = quiz.questions[idx];
  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Question {idx + 1} of {quiz.questions.length}
        </p>
      </div>
      <h2 className="text-xl font-semibold leading-relaxed">{q.question}</h2>
      <div className="grid gap-3 flex-1 overflow-y-auto content-start pb-4 pr-2">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            className={cn(
              "rounded-xl border-2 p-4 text-left text-sm transition-all duration-200",
              answer === i 
                ? "border-primary bg-primary/10 shadow-sm" 
                : "border-border bg-surface-1 hover:bg-surface-2 hover:border-muted-foreground/30",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="flex justify-between shrink-0 pt-2 border-t border-border mt-auto">
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        <Button onClick={onNext} disabled={answer == null} size="default">
          {idx + 1 < quiz.questions.length ? "Next Question" : "See Results"}
        </Button>
      </div>
    </div>
  );
}

function ResultView({
  quiz,
  answers,
  onRetry,
  onRegenerate,
}: {
  quiz: Quiz;
  answers: number[];
  onRetry: () => void;
  onRegenerate: () => void;
}) {
  const score = quiz.questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
    0,
  );

  async function exportToMarkdown() {
    let md = `# Quiz Revision\n\n**Score:** ${score}/${quiz.questions.length}\n\n`;
    
    quiz.questions.forEach((q, i) => {
      const ok = answers[i] === q.correctIndex;
      md += `### Q: ${q.question}\n`;
      md += `**Your Answer:** ${answers[i] != null ? q.options[answers[i]] : "Skipped"} ${ok ? "✅" : "❌"}\n`;
      if (!ok) {
        md += `**Correct Answer:** ${q.options[q.correctIndex]}\n`;
      }
      md += `> **Explanation:** ${q.explanation}\n\n`;
    });

    try {
      const resource = await getDb().resources.get(quiz.resourceId);
      await createNote({
        resourceId: quiz.resourceId,
        dayNumber: resource?.dayAssignment ?? null,
        isGlobal: false,
        title: `Quiz Revision: ${score}/${quiz.questions.length}`,
        linkedTimestamp: null,
        contentMarkdown: md,
        content: md,
      });
      toast.success("Quiz exported to a new Note!");
    } catch (e) {
      toast.error("Failed to export quiz");
    }
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="text-center shrink-0">
        <div className="mx-auto mb-3 flex size-24 items-center justify-center rounded-full gradient-accent text-3xl font-bold text-white shadow-lg">
          {score}/{quiz.questions.length}
        </div>
        <p className="text-base text-muted-foreground font-medium">
          {score === quiz.questions.length
            ? "Perfect score!"
            : score / quiz.questions.length >= 0.7
              ? "Great job!"
              : "Keep practicing, you'll get it!"}
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 content-start pb-4">
        {quiz.questions.map((q, i) => {
          const ok = answers[i] === q.correctIndex;
          return (
            <div
              key={i}
              className={cn(
                "rounded-xl border p-4 text-sm",
                ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
              )}
            >
              <p className="font-semibold text-base mb-2">{q.question}</p>
              <div className="space-y-1.5 text-muted-foreground">
                {!ok && answers[i] != null && (
                  <p className="line-through opacity-70 text-destructive">You answered: {q.options[answers[i]]}</p>
                )}
                <p className={cn("font-medium", ok ? "text-success" : "")}>
                  {ok ? "✓ " : "✗ Correct: "}{q.options[q.correctIndex]}
                </p>
                <p className="mt-2 text-foreground/80 text-xs bg-background/50 p-2 rounded-md border border-border/50">
                  {q.explanation}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 shrink-0 pt-4 border-t border-border mt-auto">
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={exportToMarkdown}
          >
            <FileText className="mr-2 size-4" /> Export to Notes
          </Button>
          {score < quiz.questions.length && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => createFlashcardsFromMistakes(quiz, answers)}
            >
              <Layers className="mr-2 size-4" /> Learn from Mistakes
            </Button>
          )}
        </div>
        <div className="flex gap-2 w-full">
          <Button variant="secondary" onClick={onRetry} className="flex-1">
            <RefreshCw className="mr-2 size-4" /> Retry
          </Button>
          <Button onClick={onRegenerate} className="flex-1">
            <Sparkles className="mr-2 size-4" /> New AI Quiz
          </Button>
        </div>
      </div>
    </div>
  );
}
