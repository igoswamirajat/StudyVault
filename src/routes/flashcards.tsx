import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, useEffect } from "react";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Button } from "@/components/ui/button";
import { gradeFlashcard, type Grade, type Flashcard } from "@/services/flashcardService";
import { Sparkles, ChevronLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/flashcards")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <FlashcardsPage />
    </ClientOnly>
  ),
});

function FlashcardsPage() {
  const allCards = useLiveQuery(() => getDb().flashcards.toArray(), []) ?? [];
  const resources = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const [revealed, setRevealed] = useState(false);
  const [queueIds, setQueueIds] = useState<string[] | null>(null);

  const dueCards = useMemo(
    () => allCards.filter((c) => c.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt),
    [allCards],
  );

  // Build queue once when due cards arrive
  useEffect(() => {
    if (queueIds === null && allCards.length > 0) {
      setQueueIds(dueCards.map((c) => c.id));
    }
  }, [allCards.length, queueIds, dueCards]);

  const current: Flashcard | undefined = useMemo(() => {
    if (!queueIds || queueIds.length === 0) return undefined;
    return allCards.find((c) => c.id === queueIds[0]);
  }, [queueIds, allCards]);

  const resourceFor = (id: string | null) => (id ? resources.find((r) => r.id === id) : undefined);

  async function grade(g: Grade) {
    if (!current) return;
    await gradeFlashcard(current.id, g);
    setRevealed(false);
    setQueueIds((q) => (q ? q.slice(1) : q));
  }

  const stats = {
    total: allCards.length,
    due: dueCards.length,
    learned: allCards.filter((c) => c.repetitions >= 2).length,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
          <p className="text-sm text-muted-foreground">
            {stats.due} due · {stats.learned} learned · {stats.total} total
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/library">
            <ChevronLeft className="mr-1 size-4" /> Library
          </Link>
        </Button>
      </div>

      {allCards.length === 0 ? (
        <EmptyState message="No flashcards yet. Open a resource and tap “Generate flashcards”." />
      ) : !current ? (
        <EmptyState
          message={
            queueIds && queueIds.length === 0
              ? "All caught up for now! Come back when more cards are due."
              : "Loading…"
          }
        >
          {queueIds && queueIds.length === 0 && (
            <Button
              className="mt-4"
              onClick={() => {
                setQueueIds(dueCards.map((c) => c.id));
                setRevealed(false);
              }}
            >
              Refresh queue
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface-1 p-8 min-h-[260px] flex flex-col">
            {(() => {
              const r = resourceFor(current.resourceId);
              return (
                <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {r ? (
                      <Link to="/study/$resourceId" params={{ resourceId: r.id }} className="hover:text-foreground">
                        {r.name}
                      </Link>
                    ) : (
                      "Unassigned"
                    )}
                  </span>
                  <span>
                    Ease {current.ease.toFixed(2)} · interval {current.interval}d · reps{" "}
                    {current.repetitions}
                  </span>
                </div>
              );
            })()}
            <div className="flex-1">
              <p className="text-lg font-medium leading-snug">{current.front}</p>
              {current.hint && !revealed && (
                <p className="mt-2 text-xs text-muted-foreground">💡 {current.hint}</p>
              )}
              {revealed && (
                <div className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-foreground/90">
                  {current.back}
                </div>
              )}
            </div>
          </div>

          {!revealed ? (
            <Button className="w-full" onClick={() => setRevealed(true)}>
              Show answer
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              <Button variant="outline" onClick={() => grade(1)}>
                Again
              </Button>
              <Button variant="outline" onClick={() => grade(3)}>
                Hard
              </Button>
              <Button onClick={() => grade(4)}>Good</Button>
              <Button variant="outline" onClick={() => grade(5)}>
                Easy
              </Button>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Next review:{" "}
            {current.lastReviewedAt
              ? formatDistanceToNow(new Date(current.dueAt), { addSuffix: true })
              : "now"}{" "}
            · {(queueIds?.length ?? 0) - 1} more in queue
          </p>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
      <Sparkles className="mx-auto mb-3 size-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}
