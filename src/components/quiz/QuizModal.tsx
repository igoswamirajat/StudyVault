import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { generateQuizForResource } from "@/services/quizService";
import type { Quiz } from "@/db/schema";
import { getDb } from "@/db/schema";
import { getOrCreateProgress } from "@/services/progressService";
import { cn } from "@/lib/utils";

interface Props {
  resourceId: string;
  onClose: () => void;
}

export function QuizModal({ resourceId, onClose }: Props) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(force = false) {
    setLoading(true);
    try {
      const resource = await getDb().resources.get(resourceId);
      if (!resource) throw new Error("Resource not found");
      const q = await generateQuizForResource(resource, { force });
      setQuiz(q);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        {loading || !quiz ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-sm">Generating AI quiz from your summary…</p>
          </div>
        ) : done ? (
          <ResultView
            quiz={quiz}
            answers={answers}
            onRetry={() => {
              setAnswers([]);
              setIdx(0);
              setDone(false);
            }}
            onRegenerate={async () => {
              setAnswers([]);
              setIdx(0);
              setDone(false);
              await load(true);
            }}
            onClose={onClose}
          />
        ) : (
          <QuestionView
            quiz={quiz}
            idx={idx}
            answer={answers[idx]}
            onPick={pick}
            onNext={() => (idx + 1 < quiz.questions.length ? setIdx(idx + 1) : finish())}
            onSkip={() => (idx + 1 < quiz.questions.length ? setIdx(idx + 1) : finish())}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}


function QuestionView({
  quiz,
  idx,
  answer,
  onPick,
  onNext,
  onSkip,
  onClose,
}: {
  quiz: Quiz;
  idx: number;
  answer: number | undefined;
  onPick: (n: number) => void;
  onNext: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const q = quiz.questions[idx];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Question {idx + 1} of {quiz.questions.length}
        </p>
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <h2 className="text-lg font-semibold leading-snug">{q.question}</h2>
      <div className="grid gap-2">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            className={cn(
              "rounded-lg border p-3 text-left text-sm transition-colors",
              answer === i ? "border-primary bg-primary/10" : "border-border bg-surface-1 hover:bg-surface-2",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        <Button onClick={onNext} disabled={answer == null}>
          {idx + 1 < quiz.questions.length ? "Next" : "Finish"}
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
  onClose,
}: {
  quiz: Quiz;
  answers: number[];
  onRetry: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const score = quiz.questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0),
    0,
  );
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-2 flex size-24 items-center justify-center rounded-full gradient-accent text-3xl font-bold text-white">
          {score}/{quiz.questions.length}
        </div>
        <p className="text-sm text-muted-foreground">
          {score === quiz.questions.length
            ? "Perfect!"
            : score / quiz.questions.length >= 0.7
              ? "Nice work"
              : "Keep practicing"}
        </p>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {quiz.questions.map((q, i) => {
          const ok = answers[i] === q.correctIndex;
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-3 text-xs",
                ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
              )}
            >
              <p className="font-medium">{q.question}</p>
              <p className="mt-1 text-muted-foreground">
                {ok ? "✓ Correct. " : "✗ "}
                {q.explanation}
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onRegenerate}>
          <Sparkles className="mr-1 size-4" /> New AI quiz
        </Button>
        <Button variant="ghost" onClick={onRetry}>
          <RefreshCw className="mr-1 size-4" /> Retry
        </Button>
        <Button onClick={onClose}>Back to resource</Button>
      </div>
    </div>
  );
}

