import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, useEffect, useCallback } from "react";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Button } from "@/components/ui/button";
import { gradeFlashcard, type Grade, type Flashcard } from "@/services/flashcardService";
import { Sparkles, ChevronLeft, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useMotionValueEvent,
} from "framer-motion";

export const Route = createFileRoute("/flashcards")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <FlashcardsPage />
    </ClientOnly>
  ),
});

const CARD_DIRECTION = {
  left: 1, // Again
  right: 4, // Good
};

function FlashcardsPage() {
  const allCards = useLiveQuery(() => getDb().flashcards.toArray(), []) ?? [];
  const resources = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const [revealed, setRevealed] = useState(false);
  const [queueIds, setQueueIds] = useState<string[] | null>(null);

  const dueCards = useMemo(
    () => allCards.filter((c) => c.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt),
    [allCards],
  );

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

  const grade = useCallback(
    async (g: Grade) => {
      if (!current) return;
      await gradeFlashcard(current.id, g);
      setRevealed(false);
      setQueueIds((q) => (q ? q.slice(1) : q));
    },
    [current],
  );

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
              <RotateCcw className="mr-1.5 size-4" /> Refresh queue
            </Button>
          )}
        </EmptyState>
      ) : (
        <FlashcardCard
          key={current.id}
          card={current}
          resource={resourceFor(current.resourceId)}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onGrade={grade}
        />
      )}
    </div>
  );
}

function FlashcardCard({
  card,
  resource,
  revealed,
  onReveal,
  onGrade,
}: {
  card: Flashcard;
  resource: { name: string; id: string } | undefined;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (g: 1 | 3 | 4 | 5) => void;
}) {
  const dragX = useMotionValue(0);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [flying, setFlying] = useState<"left" | "right" | null>(null);

  const rotate = useTransform(dragX, [-250, 0, 250], [-18, 0, 18]);
  const scale = useTransform(dragX, [-250, 0, 250], [0.85, 1, 0.85]);
  const badOpacity = useTransform(dragX, [-250, -120, 0], [1, 1, 0]);
  const goodOpacity = useTransform(dragX, [0, 120, 250], [0, 1, 1]);

  useMotionValueEvent(dragX, "change", (latest: number) => {
    if (flying) return;
    setSwipeDir(latest > 30 ? "right" : latest < -30 ? "left" : null);
  });

  const handleDragEnd = useCallback(() => {
    const x = dragX.get();
    if (x > 110) {
      setFlying("right");
      setSwipeDir("right");
      setTimeout(() => onGrade(4), 220);
    } else if (x < -110) {
      setFlying("left");
      setSwipeDir("left");
      setTimeout(() => onGrade(1), 220);
    } else {
      setFlying(null);
      setSwipeDir(null);
    }
  }, [dragX, onGrade]);

  return (
    <div className="relative space-y-4">
      <motion.div
        className={
          "relative rounded-2xl border border-border bg-surface-1 p-8 min-h-[280px] flex flex-col cursor-grab " +
          (flying ? "pointer-events-none" : "active:cursor-grabbing")
        }
        style={{ x: dragX, rotate, scale }}
        drag={!flying}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
      >
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          {resource ? (
            <Link
              to="/study/$resourceId"
              params={{ resourceId: resource.id }}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {resource.name}
            </Link>
          ) : (
            <span>Unassigned</span>
          )}
          <span>
            Ease {card.ease.toFixed(2)} · interval {card.interval}d · reps {card.repetitions}
          </span>
        </div>

        <AnimatePresence mode="wait">
          {!revealed ? (
            <motion.div
              key="front"
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.05, y: -16 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <p className="max-w-md text-xl font-medium leading-snug">{card.front}</p>
              {card.hint && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                  className="mt-4 text-sm text-muted-foreground"
                >
                  💡 {card.hint}
                </motion.p>
              )}
              <motion.button
                onClick={onReveal}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Show answer <RotateCcw className="size-4" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="back"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -12 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              className="flex flex-1 flex-col"
            >
              <p className="text-base font-medium text-muted-foreground">{card.front}</p>
              <div className="mt-4 flex-1 rounded-lg border border-border bg-background/60 p-4 text-sm leading-relaxed">
                {card.back}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Layout animation: pill that grows/shrinks with drag */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: "none" }}
        >
          <motion.span
            style={{ opacity: badOpacity }}
            className="absolute left-4 top-4 rounded-lg bg-destructive/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-destructive"
          >
            Again
          </motion.span>
          <motion.span
            style={{ opacity: goodOpacity }}
            className="absolute right-4 top-4 rounded-lg bg-success/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-success"
          >
            Good
          </motion.span>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {revealed && !flying && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="grid grid-cols-4 gap-2"
          >
            {(
              [
                [1, "Again", "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"],
                [3, "Hard", "border-border bg-surface-1 hover:bg-accent"],
                [4, "Good", "bg-primary text-primary-foreground hover:bg-primary/90"],
                [5, "Easy", "border-success/30 bg-success/5 text-success hover:bg-success/10"],
              ] as const
            ).map(([g, label, cls]) => (
              <motion.button
                key={label}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onGrade(g)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${cls}`}
              >
                {label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.p
        layout
        className="text-center text-xs text-muted-foreground"
      >
        Swipe right = Good · Swipe left = Again ·{" "}
        {card.lastReviewedAt
          ? `next review ${formatDistanceToNow(new Date(card.dueAt), { addSuffix: true })}`
          : "due now"}
      </motion.p>
    </div>
  );
}

function EmptyState({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="rounded-2xl border border-dashed border-border p-12 text-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.5, rotate: -120 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.15 }}
        className="mx-auto mb-3 size-10 text-muted-foreground/50"
      >
        <Sparkles className="size-full" />
      </motion.div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {children}
    </motion.div>
  );
}