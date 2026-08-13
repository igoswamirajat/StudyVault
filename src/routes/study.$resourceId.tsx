import { createFileRoute, useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { WebViewer } from "@/components/study/WebViewer";
import { VideoViewer, type VideoController } from "@/components/study/VideoViewer";
import { PdfViewer } from "@/components/study/PdfViewer";
import { MarkdownViewer, HtmlViewer, ImageViewer } from "@/components/study/MarkdownViewer";
import {
  EditableCodeViewer,
  EditableHtmlViewer,
  EditableMarkdownViewer,
} from "@/components/study/MarkdownViewer";
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
import { driveOpenUrl } from "@/services/driveService";
import {
  downloadResourceToLocal,
  isFsSupported,
  pickDirectory,
} from "@/services/fileSystemService";
import { aiGenerateFlashcards } from "@/services/aiService";
import { addFlashcards } from "@/services/flashcardService";
import { buildResourceContext, gatherResourceMedia } from "@/services/aiContext";
import { exportResourceSummaryPdf } from "@/services/exportService";
import { Link as RouterLink } from "@tanstack/react-router";
import { getPlaylist, setPlaylist } from "@/lib/playlist";
import { youtubeWatchUrl } from "@/services/youtubeParse";
import { PomodoroWidget } from "@/components/study/PomodoroWidget";
import { AiDock } from "@/components/study/AiDock";
import { fetchAndCacheTranscript } from "@/services/youtubeTranscript.service";
import type { AssistantAction } from "@/services/aiService";
import { createFolder, moveResources } from "@/services/fileOpsService";
import { generateQuizForResource } from "@/services/quizService";
import { getOrCreateSummary, updateNote, createNote } from "@/services/notesService";
import { aiGenerateSummary } from "@/services/aiService";
import { useResizableSize, ResizeHandle } from "@/hooks/useResizableSize";
import { FeynmanAssessmentModal } from "@/components/study/FeynmanAssessmentModal";

export const Route = createFileRoute("/study/$resourceId")({
  errorComponent: StudyRoomError,
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <StudyRoom />
    </ClientOnly>
  ),
});

/** True when the resource was created in-app (blank file) — content lives in a linked note. */
function isEditableDocument(resource: {
  source?: string;
  isDownloaded?: boolean;
  localPath?: string | null;
}): boolean {
  return resource.source === "local" && !resource.isDownloaded && !resource.localPath;
}

function folderMatchesUnit(folderPath: string | undefined, unitName: string): boolean {
  if (!folderPath || !unitName) return false;
  const last = folderPath.split("/").filter(Boolean).pop();
  return last ? last.toLowerCase() === unitName.toLowerCase() : false;
}

function StudyRoomError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-background px-4">
      <div className="max-w-md border border-border bg-surface-1 p-6 text-center shadow-[6px_6px_0_var(--foreground)]">
        <h1 className="text-xl font-semibold">Study Room recovered from an error</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Viewer state was reset safely. Retry or return to Library.
        </p>
        <details className="mt-3 text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap">{error.message}</pre>
        </details>
        <div className="mt-5 flex justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" onClick={() => navigateToLibrary()}>
            Library
          </Button>
        </div>
      </div>
    </div>
  );
}

function navigateToLibrary() {
  window.location.assign("/library");
}

function StudyRoom() {
  const { resourceId } = Route.useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const reducedMotion = useReducedMotion();
  const [notesOpen, setNotesOpen] = useState(true);
  const queueSize = useResizableSize({
    storageKey: "panel:study:queueWidth",
    defaultValue: 260,
    min: 200,
    max: 480,
    direction: "left",
  });
  const notesSize = useResizableSize({
    storageKey: "panel:study:notesWidth",
    defaultValue: 340,
    min: 260,
    max: 560,
    direction: "right",
  });
  const [fcDialogOpen, setFcDialogOpen] = useState(false);
  const [feynmanOpen, setFeynmanOpen] = useState(false);
  const [fcCount, setFcCount] = useState(8);
  const [isGeneratingFc, setIsGeneratingFc] = useState(false);
  const videoControllerRef = useRef<VideoController | null>(null);
  const { elapsedSec } = useStudySession(resourceId);

  const resource = useLiveQuery(() => getDb().resources.get(resourceId), [resourceId]);
  const allResources = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const progress = useLiveQuery(() => getDb().progress.get(resourceId), [resourceId]);
  const flashcards = useLiveQuery(
    () => getDb().flashcards.where("resourceId").equals(resourceId).toArray(),
    [resourceId],
  );

  const fcStats = useMemo(() => {
    if (!flashcards) return { due: 0, total: 0 };
    const now = Date.now();
    return {
      due: flashcards.filter((c) => c.dueAt <= now).length,
      total: flashcards.length,
    };
  }, [flashcards]);

  // Session playlists take precedence. YouTube resources get a stable playlist
  // automatically, so opening any lesson still exposes the full course queue.
  const sessionPlaylist = useMemo(() => getPlaylist(), [resourceId]);
  const youtubePlaylist = useMemo(() => {
    if (!resource?.youtubePlaylistId) return null;
    const items = allResources
      .filter((item) => item.youtubePlaylistId === resource.youtubePlaylistId)
      .sort((a, b) => (a.youtubeIndex ?? a.orderIndex) - (b.youtubeIndex ?? b.orderIndex));
    return {
      label: resource.folderPath ?? "YouTube playlist",
      ids: items.map((item) => item.id),
    };
  }, [allResources, resource]);
  const playlist = useMemo(() => {
    if (sessionPlaylist?.ids.includes(resourceId)) return sessionPlaylist;
    return youtubePlaylist ?? sessionPlaylist;
  }, [resourceId, sessionPlaylist, youtubePlaylist]);
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

  // Lazy-fetch YouTube transcript if not already cached
  useEffect(() => {
    if (resource?.source === "youtube" && resource.youtubeVideoId) {
      void fetchAndCacheTranscript(resourceId);
    }
  }, [resourceId, resource?.source, resource?.youtubeVideoId]);

  const goNext = useCallback(() => {
    if (next) navigate({ to: "/study/$resourceId", params: { resourceId: next.id } });
  }, [next, navigate]);
  const goPrev = useCallback(() => {
    if (prev) navigate({ to: "/study/$resourceId", params: { resourceId: prev.id } });
  }, [prev, navigate]);

  const toggleDone = useCallback(async () => {
    if (progress?.status === "completed") {
      await setStatus(resourceId, "in_progress");
      toast.success("Marked as incomplete");
    } else {
      await setStatus(resourceId, "completed");
      toast.success("Marked as complete! 🎉 +15 XP Earned");
      // Intercept with Feynman Assessment instead of auto-advancing immediately
      setFeynmanOpen(true);
    }
  }, [progress?.status, resourceId]);

  const handleFeynmanComplete = () => {
    setFeynmanOpen(false);
    if (settings.autoAdvance && next) {
      navigate({ to: "/study/$resourceId", params: { resourceId: next.id } });
    }
  };

  const handleVideoEnded = useCallback(() => {
    if (progress?.status !== "completed") {
      void toggleDone();
    }
  }, [progress?.status, toggleDone]);

  const handleVideoController = useCallback((controller: VideoController | null) => {
    videoControllerRef.current = controller;
  }, []);

  const generateFlashcards = useCallback(async (count: number) => {
    if (!resource) return;
    setIsGeneratingFc(true);
    setFcDialogOpen(false);
    const tid = toast.loading("Generating flashcards from your summary…");
    try {
      const context = await buildResourceContext(resource);
      const media = await gatherResourceMedia(resource);
      const result = await aiGenerateFlashcards(resource.name, context, resource.type, count, media);
      const added = await addFlashcards(resource.id, result.cards, "ai");
      toast.success(`Added ${added.length} flashcards`, { id: tid });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't generate flashcards. Try again.", { id: tid });
    } finally {
      setIsGeneratingFc(false);
    }
  }, [resource]);


  const exportPdf = useCallback(async () => {
    if (!resource) return;
    await exportResourceSummaryPdf(resource);
  }, [resource]);

  // ---- AI Assistant wiring -------------------------------------------------

  const buildSessionContext = useCallback(() => {
    const lines: string[] = [];
    if (resource) {
      lines.push(`Current resource: "${resource.name}" (${resource.type}, id ${resource.id}).`);
      if (resource.folderPath) lines.push(`Folder: ${resource.folderPath}`);
      lines.push(`Progress: ${progress?.status ?? "not started"}.`);
      if (progress?.quizScore != null) lines.push(`Quiz score: ${progress.quizScore}%`);
      if (progress?.timeSpentSeconds) {
        lines.push(`Time studied: ${Math.round(progress.timeSpentSeconds / 60)} min`);
      }
    }
    if (next) lines.push(`Next in playlist: "${next.name}".`);
    if (prev) lines.push(`Previous in playlist: "${prev.name}".`);
    const siblings = dayList.slice(0, 40).map((r) => `- ${r.name} (${r.type})`);
    if (siblings.length) lines.push(`Items in the current playlist:\n${siblings.join("\n")}`);
    const folders = [...new Set(allResources.map((r) => r.folderPath).filter(Boolean))].slice(
      0,
      40,
    );
    if (folders.length) lines.push(`Existing folders: ${folders.join(", ")}`);
    return lines.join("\n");
  }, [resource, progress, next, prev, dayList, allResources]);

  const runAction = useCallback(
    async (action: AssistantAction): Promise<string> => {
      const findByName = (name?: string) => {
        if (!name) return undefined;
        const n = name.toLowerCase();
        return (
          allResources.find((r) => r.name.toLowerCase() === n) ??
          allResources.find((r) => r.name.toLowerCase().includes(n))
        );
      };

      switch (action.type) {
        case "open_resource": {
          const target = findByName(action.resourceName);
          if (!target) throw new Error(`Couldn't find "${action.resourceName}"`);
          navigate({ to: "/study/$resourceId", params: { resourceId: target.id } });
          return `Opened "${target.name}"`;
        }
        case "go_to_route": {
          const route = action.route?.startsWith("/") ? action.route : `/${action.route ?? ""}`;
          navigate({ to: route });
          return `Went to ${route}`;
        }
        case "next":
          if (!next) throw new Error("Nothing after this one");
          goNext();
          return `Next: "${next.name}"`;
        case "prev":
          if (!prev) throw new Error("Nothing before this one");
          goPrev();
          return `Previous: "${prev.name}"`;
        case "mark_complete": {
          const id = action.resourceId ?? resourceId;
          await setStatus(id, "completed");
          return "Marked complete";
        }
        case "create_unit": {
          if (!action.unitName) throw new Error("No unit name given");
          const path = await createFolder(action.unitName, action.parentPath ?? "");
          return `Created folder "${path}"`;
        }
        case "move_to_unit": {
          if (!action.unitName) throw new Error("No target unit given");
          const targetPath =
            allResources.find((r) => folderMatchesUnit(r.folderPath, action.unitName!))
              ?.folderPath ?? action.unitName;
          const ids = (action.resourceNames ?? [])
            .map((nm) => findByName(nm)?.id)
            .filter((x): x is string => Boolean(x));
          if (!ids.length) throw new Error("No matching resources to move");
          await moveResources(ids, targetPath);
          return `Moved ${ids.length} item(s) to "${targetPath}"`;
        }
        case "start_studying": {
          const items = allResources
            .filter((r) => r.folderPath?.endsWith(action.unitName ?? " "))
            .sort((a, b) => a.orderIndex - b.orderIndex);
          if (!items.length) throw new Error(`No resources in "${action.unitName}"`);
          setPlaylist({ label: action.unitName!, ids: items.map((r) => r.id) });
          navigate({ to: "/study/$resourceId", params: { resourceId: items[0].id } });
          return `Studying "${action.unitName}" (${items.length} items)`;
        }
        case "generate_summary": {
          if (!resource) throw new Error("No resource open");
          const summary = await getOrCreateSummary(resource);
          const context = await buildResourceContext(resource, {
            maxChars: 10000,
            includeSiblings: false,
            includeUserSummary: false,
          });
          const media = await gatherResourceMedia(resource);
          const result = await aiGenerateSummary(resource.name, context, media);
          await updateNote(summary.id, {
            contentMarkdown:
              (summary.contentMarkdown ?? "") + `\n\n---\n\n**AI Summary:**\n\n${result.summary}`,
          });
          return "Summary added to notes";
        }
        case "generate_flashcards":
          return "Flashcards generation is now available in the Command Palette or Flashcards tab.";
        case "generate_quiz": {
          if (!resource) throw new Error("No resource open");
          await generateQuizForResource(resource, { force: true });
          return "Quiz ready. Check the Quiz tab in the Notes panel.";
        }
        case "create_note_from_chat": {
          const title = action.title || "Note from AI Chat";
          const content = action.content || "";
          const note = await createNote({
            resourceId: resourceId,
            dayNumber: null,
            isGlobal: false,
            title,
            linkedTimestamp: null,
          });
          await updateNote(note.id, { contentMarkdown: content, content });
          toast.success(`Note "${title}" created`);
          return `Created note "${title}"`;
        }
        default:
          return "";
      }
    },
    [allResources, navigate, next, prev, goNext, goPrev, resourceId, resource],
  );

  // Hotkeys
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.key === "n" || e.key === "N") {
        setNotesOpen((o) => !o);
      } else if (e.shiftKey && e.key === "ArrowRight") {
        goNext();
      } else if (e.shiftKey && e.key === "ArrowLeft") {
        goPrev();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        await toggleDone();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, toggleDone]);

  async function handleDownload() {
    if (!resource) return;
    if (resource.source === "youtube") {
      toast.info("YouTube lessons play online and cannot be downloaded here.");
      return;
    }
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
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* Left: day list */}
      <aside
        style={{ width: queueSize.size }}
        className="hidden min-h-0 shrink-0 border-r border-border bg-surface-1/40 lg:flex lg:flex-col"
      >
        <div className="border-b border-border p-3">
          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {playlist?.label ??
              (resource.folderPath ||
                (resource.dayAssignment != null ? `Day ${resource.dayAssignment}` : "Unassigned"))}
          </p>
          <p className="mt-0.5 text-sm font-medium">
            {currentIdx + 1} of {dayList.length}
            {playlist ? " · Playlist" : ""}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {dayList.map((r, i) => (
            <Link
              key={r.id}
              to="/study/$resourceId"
              params={{ resourceId: r.id }}
              className={`block rounded px-2 py-1.5 text-xs transition-colors ${
                r.id === resourceId
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60"
              }`}
            >
              <span className="mr-2 text-[10px] tabular-nums text-muted-foreground">{i + 1}.</span>
              <span className="truncate">{r.name}</span>
            </Link>
          ))}
        </div>
      </aside>

      <ResizeHandle side="left" onMouseDown={queueSize.startDrag} />

      {/* Center: viewer + header + footer */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-1 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {playlist?.label ??
                resource.folderPath ??
                (resource.dayAssignment != null
                  ? `Day ${resource.dayAssignment}`
                  : "Unassigned")}{" "}
              › {resource.type}
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
              href={
                resource.source === "youtube"
                  ? youtubeWatchUrl(resource.youtubeVideoId ?? "", resource.youtubePlaylistId)
                  : driveOpenUrl(resource.driveId)
              }
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={resource.source === "youtube" ? "Open in YouTube" : "Open in Drive"}
            >
              <ExternalLink className="size-4" />
            </a>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNotesOpen((o) => !o)}
              aria-label="Toggle notes"
            >
              {notesOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={resource.id}
              initial={reducedMotion ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
              className="h-full"
            >
              {resource.type === "video" ? (
                <VideoViewer
                  resource={resource}
                  resumeEnabled={Boolean(settings.resumeVideos)}
                  onEnded={handleVideoEnded}
                  onControllerReady={handleVideoController}
                />
              ) : resource.type === "pdf" ? (
                <PdfViewer resource={resource} />
              ) : resource.type === "markdown" ? (
                isEditableDocument(resource) ? (
                  <EditableMarkdownViewer resource={resource} />
                ) : (
                  <MarkdownViewer resource={resource} />
                )
              ) : resource.type === "html" ? (
                isEditableDocument(resource) ? (
                  <EditableHtmlViewer resource={resource} />
                ) : (
                  <HtmlViewer resource={resource} />
                )
              ) : resource.type === "image" ? (
                <ImageViewer resource={resource} />
              ) : resource.type === "other" && isEditableDocument(resource) ? (
                <EditableCodeViewer resource={resource} />
              ) : resource.type === "web" ? (
                <WebViewer resource={resource} />
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
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface-1 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={goPrev} disabled={!prev}>
            <ChevronLeft className="mr-1 size-4" /> Previous
          </Button>
          <div className="flex items-center gap-2">
            {progress?.status === "completed" ? (
              <Button size="sm" variant="secondary" onClick={toggleDone} className="bg-success/10 text-success hover:bg-success/20 hover:text-success">
                <CheckCircle2 className="mr-1 size-4" /> Completed
              </Button>
            ) : (
              <Button size="sm" onClick={toggleDone}>
                <Check className="mr-1 size-4" /> Mark as done
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setFcDialogOpen(true)}>
              <Layers className="mr-1 size-3.5" /> Generate Flashcards
            </Button>
            <Button asChild size="sm" variant="ghost">
              <RouterLink to="/flashcards">Review</RouterLink>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={exportPdf}
              title="Export this resource as PDF"
            >
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
        <>
          <ResizeHandle side="right" onMouseDown={notesSize.startDrag} />
          <aside
            style={{ width: notesSize.size }}
            className="hidden min-h-0 shrink-0 border-l border-border bg-surface-1/40 xl:flex xl:flex-col"
          >
            <NotesPanel
              resource={resource}
              resourceId={resource.id}
              dayNumber={resource.dayAssignment}
              getVideoTime={
                resource.type === "video"
                  ? () => videoControllerRef.current?.getCurrentTime() ?? null
                  : undefined
              }
              onSeekVideo={
                resource.type === "video"
                  ? (seconds) => videoControllerRef.current?.seekTo(seconds)
                  : undefined
              }
            />
          </aside>
        </>
      )}

      <FeynmanAssessmentModal 
        resource={resource ?? null}
        open={feynmanOpen}
        onOpenChange={(open) => {
          if (!open) handleFeynmanComplete();
        }}
      />

      <PomodoroWidget />
      <AiDock resource={resource} buildSessionContext={buildSessionContext} runAction={runAction} />

      <Dialog open={fcDialogOpen} onOpenChange={setFcDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>How many flashcards?</DialogTitle>
            <DialogDescription>
              Select how many flashcards you want the AI to generate based on this resource's context.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            {[5, 10, 15, 20].map((c) => (
              <Button
                key={c}
                variant={fcCount === c ? "default" : "outline"}
                onClick={() => setFcCount(c)}
              >
                {c} Flashcards
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFcDialogOpen(false)}>Cancel</Button>
            <Button disabled={isGeneratingFc} onClick={() => generateFlashcards(fcCount)}>
              {isGeneratingFc ? "Generating..." : "Generate Flashcards"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
