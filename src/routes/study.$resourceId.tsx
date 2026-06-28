import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { VideoViewer } from "@/components/study/VideoViewer";
import { PdfViewer } from "@/components/study/PdfViewer";
import { MarkdownViewer, HtmlViewer, ImageViewer } from "@/components/study/MarkdownViewer";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Check,
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose,
  Sparkles,
  ExternalLink,
  Download,
  Layers,
  FileText,
} from "lucide-react";
import { setStatus, getOrCreateProgress } from "@/services/progressService";
import { useStudySession } from "@/hooks/useStudySession";
import { useSettings } from "@/hooks/useSettings";
import { formatHMS } from "@/lib/format-time";
import { toast } from "sonner";
import { QuizModal } from "@/components/quiz/QuizModal";
import { driveOpenUrl } from "@/services/driveService";
import { downloadResourceToLocal, isFsSupported, pickDirectory } from "@/services/fileSystemService";
import { generateFlashcardsAI } from "@/lib/ai.functions";
import { addFlashcards } from "@/services/flashcardService";
import { getOrCreateSummary } from "@/services/notesService";
import { exportResourceSummaryPdf } from "@/services/exportService";
import { Link as RouterLink } from "@tanstack/react-router";
import { getPlaylist } from "@/lib/playlist";
import { PomodoroWidget } from "@/components/study/PomodoroWidget";

export const Route = createFileRoute("/study/$resourceId")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <StudyRoom />
    </ClientOnly>
  ),
});

function StudyRoom() {
  const { resourceId } = Route.useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [notesOpen, setNotesOpen] = useState(true);
  const [quizOpen, setQuizOpen] = useState(false);
  const [genFc, setGenFc] = useState(false);
  const { elapsedSec } = useStudySession(resourceId);

  const resource = useLiveQuery(() => getDb().resources.get(resourceId), [resourceId]);
  const allResources = (useLiveQuery(() => getDb().resources.toArray(), []) ?? []);
  const progress = useLiveQuery(() => getDb().progress.get(resourceId), [resourceId]);

  // Playlist takes precedence over day-based ordering when set.
  const playlist = useMemo(() => getPlaylist(), [resourceId]);
  const dayList = useMemo(() => {
    if (playlist && playlist.ids.includes(resourceId)) {
      const byId = new Map(allResources.map((r) => [r.id, r]));
      return playlist.ids.map((id) => byId.get(id)).filter(Boolean) as typeof allResources;
    }
    if (!resource) return [];
    // Prefer folderPath grouping (current Drive folder), fallback to dayAssignment.
    if (resource.folderPath) {
      return allResources
        .filter((r) => r.folderPath === resource.folderPath)
        .sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return allResources
      .filter((r) => r.dayAssignment === resource.dayAssignment)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [allResources, resource, playlist, resourceId]);

  const currentIdx = dayList.findIndex((r) => r.id === resourceId);
  const prev = currentIdx > 0 ? dayList[currentIdx - 1] : null;
  const next = currentIdx >= 0 && currentIdx < dayList.length - 1 ? dayList[currentIdx + 1] : null;

  // Update lastOpenedAt
  useEffect(() => {
    if (resourceId) {
      void getDb().resources.update(resourceId, { lastOpenedAt: Date.now() });
      void getOrCreateProgress(resourceId);
    }
  }, [resourceId]);

  const goNext = useCallback(() => {
    if (next) navigate({ to: "/study/$resourceId", params: { resourceId: next.id } });
  }, [next, navigate]);
  const goPrev = useCallback(() => {
    if (prev) navigate({ to: "/study/$resourceId", params: { resourceId: prev.id } });
  }, [prev, navigate]);

  const markDone = useCallback(async () => {
    await setStatus(resourceId, "completed");
    toast.success("Marked as complete");
    if (settings.autoAdvance && next) {
      navigate({ to: "/study/$resourceId", params: { resourceId: next.id } });
    }
  }, [resourceId, settings.autoAdvance, next, navigate]);

  const generateFlashcards = useCallback(async () => {
    if (!resource) return;
    setGenFc(true);
    const tid = toast.loading("Generating flashcards from your summary…");
    try {
      const summary = await getOrCreateSummary(resource);
      const result = await generateFlashcardsAI({
        data: {
          title: resource.name,
          contentMarkdown: summary.contentMarkdown || resource.name,
          resourceType: resource.type,
          count: 8,
        },
      });
      const added = await addFlashcards(resource.id, result.cards, "ai");
      toast.success(`Added ${added.length} flashcards`, { id: tid });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't generate flashcards. Try again.", { id: tid });
    } finally {
      setGenFc(false);
    }
  }, [resource]);

  const exportPdf = useCallback(async () => {
    if (!resource) return;
    await exportResourceSummaryPdf(resource);
  }, [resource]);

  // Hotkeys
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "n" || e.key === "N") {
        setNotesOpen((o) => !o);
      } else if (e.shiftKey && e.key === "ArrowRight") {
        goNext();
      } else if (e.shiftKey && e.key === "ArrowLeft") {
        goPrev();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        await markDone();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, markDone]);

  async function handleDownload() {
    if (!resource) return;
    if (!isFsSupported()) {
      toast.error("Offline downloads need Chromium-based browser or Electron.");
      return;
    }
    if (!settings.offlineFolderGranted) {
      const dir = await pickDirectory();
      if (!dir) return;
    }
    try {
      toast.info("Downloading…");
      await downloadResourceToLocal(resource.id);
      toast.success(`Downloaded ${resource.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  if (!resource) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-48px)] w-full overflow-hidden">
      {/* Left: day list */}
      <aside className="hidden w-[260px] shrink-0 border-r border-border bg-surface-1/40 lg:flex lg:flex-col">
        <div className="border-b border-border p-3">
          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {playlist?.label ?? (resource.folderPath || (resource.dayAssignment != null ? `Day ${resource.dayAssignment}` : "Unassigned"))}
          </p>
          <p className="mt-0.5 text-sm font-medium">
            {currentIdx + 1} of {dayList.length}
            {playlist ? " · Playlist" : ""}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {dayList.map((r, i) => (
            <Link
              key={r.id}
              to="/study/$resourceId"
              params={{ resourceId: r.id }}
              className={`block rounded px-2 py-1.5 text-xs transition-colors ${
                r.id === resourceId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"
              }`}
            >
              <span className="mr-2 text-[10px] tabular-nums text-muted-foreground">{i + 1}.</span>
              <span className="truncate">{r.name}</span>
            </Link>
          ))}
        </div>
      </aside>

      {/* Center: viewer + header + footer */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-1 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {playlist?.label ?? resource.folderPath ?? (resource.dayAssignment != null ? `Day ${resource.dayAssignment}` : "Unassigned")} ›{" "}
              {resource.type}
            </p>
            <p className="truncate text-sm font-semibold">{resource.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {Boolean(settings.showTimerInSession) && (
              <span className="rounded-md bg-surface-2 px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                ⏱ {formatHMS(elapsedSec)}
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={handleDownload} title="Download for offline">
              <Download className="size-4" />
            </Button>
            <a
              href={driveOpenUrl(resource.driveId)}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Open in Drive"
            >
              <ExternalLink className="size-4" />
            </a>
            <Button size="sm" variant="ghost" onClick={() => setNotesOpen((o) => !o)} aria-label="Toggle notes">
              {notesOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {resource.type === "video" ? (
            <VideoViewer resource={resource} resumeEnabled={Boolean(settings.resumeVideos)} />
          ) : resource.type === "pdf" ? (
            <PdfViewer resource={resource} />
          ) : resource.type === "markdown" ? (
            <MarkdownViewer resource={resource} />
          ) : resource.type === "html" ? (
            <HtmlViewer resource={resource} />
          ) : resource.type === "image" ? (
            <ImageViewer resource={resource} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
              <div>
                <p className="mb-2">No viewer for this file type.</p>
                <Button asChild variant="outline">
                  <a href={driveOpenUrl(resource.driveId)} target="_blank" rel="noreferrer">
                    Open in Drive
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface-1 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={goPrev} disabled={!prev}>
            <ChevronLeft className="mr-1 size-4" /> Previous
          </Button>
          <div className="flex items-center gap-2">
            {progress?.status === "completed" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-3 py-1 text-xs text-success">
                <CheckCircle2 className="size-3.5" /> Completed
              </span>
            ) : (
              <Button size="sm" onClick={markDone}>
                <Check className="mr-1 size-4" /> Mark as done
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setQuizOpen(true)}>
              <Sparkles className="mr-1 size-3.5" /> Quiz
            </Button>
            <Button size="sm" variant="outline" onClick={generateFlashcards} disabled={genFc}>
              <Layers className="mr-1 size-3.5" /> {genFc ? "Generating…" : "Flashcards"}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <RouterLink to="/flashcards">Review</RouterLink>
            </Button>
            <Button size="sm" variant="ghost" onClick={exportPdf} title="Export this resource as PDF">
              <FileText className="size-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={goNext} disabled={!next}>
            Next <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </main>

      {/* Right: notes panel */}
      {notesOpen && (
        <aside className="hidden w-[340px] shrink-0 border-l border-border bg-surface-1/40 xl:flex xl:flex-col">
          <NotesPanel resource={resource} resourceId={resource.id} dayNumber={resource.dayAssignment} />
        </aside>
      )}

      {quizOpen && <QuizModal resourceId={resource.id} onClose={() => setQuizOpen(false)} />}
      <PomodoroWidget />
    </div>
  );
}
