import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Sparkles,
  FolderSearch,
  ListChecks,
  Target,
  Rocket,
  AlertCircle,
  ArrowRight,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  extractFolderId,
  looksLikeDriveFolder,
  scanFolder,
  ingestScannedFiles,
} from "@/services/driveService";
import { importLocalFolder, isFsSupported } from "@/services/fileSystemService";
import { setSetting } from "@/services/storageService";
import { useSettings } from "@/hooks/useSettings";
import { ClientOnly } from "@/components/common/ClientOnly";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  component: () => (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <Onboarding />
    </ClientOnly>
  ),
});

type Step = "welcome" | "drive" | "scanning" | "review" | "goal" | "done";

function Onboarding() {
  const navigate = useNavigate();
  const { settings, loaded } = useSettings();
  const [step, setStep] = useState<Step>("welcome");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  // Why the local-folder picker is/ isn't available:
  //   ok          -> File System Access API present
  //   insecure    -> not a secure context (LAN IP over http) — API hidden
  //   unsupported -> non-Chromium browser without the API
  const [fsReason, setFsReason] = useState<"ok" | "insecure" | "unsupported">("ok");
  const fsSupported = fsReason === "ok";
  const [error, setError] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState<{
    video: number;
    pdf: number;
    notes: number;
    other: number;
  }>({
    video: 0,
    pdf: 0,
    notes: 0,
    other: 0,
  });
  const [goal, setGoal] = useState(60);
  const savedDriveId = (settings.driveId as string | null) || null;
  const savedApiKey = (settings.driveApiKey as string | null) || null;
  const initialized = Boolean(settings.appInitialized) || Boolean(savedDriveId);

  useEffect(() => {
    if (!loaded) return;
    if (initialized && step === "welcome") {
      navigate({ to: "/library", replace: true });
    }
  }, [loaded, initialized, step, navigate]);

  // If the user already connected a Drive folder before, pre-fill the inputs
  // so they're never asked to paste the same link twice.
  useEffect(() => {
    if (!loaded) return;
    if (savedDriveId && !url) {
      setUrl(`https://drive.google.com/drive/folders/${savedDriveId}`);
    }
    if (savedApiKey && !apiKey) {
      setApiKey(savedApiKey);
      setShowKey(true);
    }
  }, [loaded, savedDriveId, savedApiKey]);

  // The local-folder picker needs the File System Access API, which the browser
  // only exposes in a *secure context* (https, or http://localhost). Detect the
  // exact reason so we can show an accurate hint instead of blaming the browser.
  useEffect(() => {
    if (isFsSupported()) {
      setFsReason("ok");
    } else if (typeof window !== "undefined" && !window.isSecureContext) {
      setFsReason("insecure");
    } else {
      setFsReason("unsupported");
    }
  }, []);

  async function handleScan() {
    setError(null);
    const id = extractFolderId(url);
    if (!id) {
      setError("That doesn't look like a Drive folder link. Paste the full URL.");
      return;
    }
    setStep("scanning");
    try {
      const files = await scanFolder(id, apiKey || null);
      if (files.length === 0) {
        setError("No files found. Make sure the folder is set to 'Anyone with the link can view'.");
        setStep("drive");
        return;
      }
      await ingestScannedFiles(files);
      await setSetting("driveId", id);
      if (apiKey) await setSetting("driveApiKey", apiKey);
      // Mark as initialized immediately so a refresh mid-flow doesn't reset onboarding.
      await setSetting("appInitialized", true);
      const counts = { video: 0, pdf: 0, notes: 0, other: 0 };
      for (const f of files) {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        if (["mp4", "mkv", "webm", "mov"].includes(ext)) counts.video++;
        else if (ext === "pdf") counts.pdf++;
        else if (["md", "txt", "html"].includes(ext)) counts.notes++;
        else counts.other++;
      }
      setFileCount(counts);
      setStep("review");
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? `${e.message} If the folder has subfolders or stays empty, add a Drive API key below.`
          : "Scan failed. Check the link and try again.",
      );
      // Surface the API-key fallback so the user doesn't have to hunt for it.
      setShowKey(true);
      setStep("drive");
    }
  }

  async function handlePickLocal() {
    setError(null);
    if (!isFsSupported()) {
      setFsReason(
        typeof window !== "undefined" && !window.isSecureContext ? "insecure" : "unsupported",
      );
      return;
    }
    setStep("scanning");
    try {
      const result = await importLocalFolder();
      if (!result || result.imported === 0) {
        setError("No new files found in that folder.");
        setStep("drive");
        return;
      }
      await setSetting("localRootName", result.rootName);
      await setSetting("appInitialized", true);
      const counts = { video: 0, pdf: 0, notes: 0, other: 0 };
      // Re-derive counts from db (simpler than threading file list back).
      const db = (await import("@/db/schema")).getDb();
      const all = await db.resources.toArray();
      for (const r of all) {
        if (r.type === "video") counts.video++;
        else if (r.type === "pdf") counts.pdf++;
        else if (r.type === "markdown") counts.notes++;
        else counts.other++;
      }
      setFileCount(counts);
      toast.success(`Imported ${result.imported} files from "${result.rootName}"`);
      setStep("review");
    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.name === "AbortError") {
        setStep("drive");
        return;
      }
      setError(e instanceof Error ? e.message : "Local import failed.");
      setStep("drive");
    }
  }

  async function finish() {
    await setSetting("dailyGoalMinutes", goal);
    await setSetting("appInitialized", true);
    toast.success("Welcome to StudyVault");
    navigate({ to: "/library" });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-10 sm:px-8">
        <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-11 shrink-0 place-items-center bg-foreground"
              aria-hidden="true"
            >
              <span className="size-4 bg-primary" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold uppercase tracking-tight">StudyVault</p>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Course ingest
              </p>
            </div>
          </div>
          <span className="hidden border border-border bg-surface-1 px-3 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground sm:inline-flex">
            Local workspace
          </span>
        </div>

        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <Slide key="welcome">
              <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px] md:items-end">
                <div>
                  <p className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Personal LMS
                  </p>
                  <h1 className="max-w-xl text-5xl font-black uppercase leading-[0.92] tracking-tight sm:text-6xl">
                    Import your full study vault.
                  </h1>
                </div>
                <div className="border border-border bg-primary p-5">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Setup state
                  </p>
                  <p className="mt-3 text-4xl font-black">{savedDriveId ? "1" : "0"}</p>
                  <p className="text-sm text-muted-foreground">folder connected</p>
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={() => setStep(savedDriveId ? "goal" : "drive")}>
                  {savedDriveId ? "Finish setup" : "Get started"}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
                {savedDriveId && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={async () => {
                      await setSetting("appInitialized", true);
                      navigate({ to: "/library" });
                    }}
                  >
                    Open library
                  </Button>
                )}
              </div>
            </Slide>
          )}

          {step === "drive" && (
            <Slide key="drive">
              <FolderSearch className="mb-3 size-8 text-primary" />
              <h2 className="mb-1 text-3xl font-black uppercase tracking-tight">Connect Drive</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Make sure the folder is set to <strong>Anyone with the link can view</strong>.
              </p>
              <div className="space-y-3">
                <Input
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-11"
                />
                <details
                  className="text-xs text-muted-foreground"
                  open={showKey}
                  onToggle={(e) => setShowKey((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="cursor-pointer">Add a Drive API key (for subfolders)</summary>
                  <Input
                    placeholder="AIza…"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-2 h-9 font-mono text-xs"
                  />
                  <p className="mt-1">
                    Optional. The basic scan reads the folder's top level; a key also pulls in
                    subfolders. Stored locally only.
                  </p>
                </details>
                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button
                  onClick={handleScan}
                  className="w-full"
                  disabled={!looksLikeDriveFolder(url)}
                >
                  Scan Drive folder
                </Button>
                <div className="flex items-center gap-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePickLocal}
                  className="w-full"
                  disabled={!fsSupported}
                >
                  <HardDrive className="mr-2 size-4" />
                  Add local folder
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {fsReason === "ok" &&
                    "Pick any folder on your computer. Files stay on your machine — nothing is uploaded."}
                  {fsReason === "insecure" &&
                    "Local folders need a secure connection. Open the app at http://localhost (on this machine) or over HTTPS — a plain http:// LAN address can't use it. Use the Drive link above instead."}
                  {fsReason === "unsupported" &&
                    "Local folders require a Chromium-based browser (Chrome, Edge, Brave). Use the Drive link above instead."}
                </p>
              </div>
            </Slide>
          )}

          {step === "scanning" && (
            <Slide key="scanning">
              <div className="flex flex-col items-center gap-4 py-12">
                <Loader2 className="size-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Reading your course…</p>
              </div>
            </Slide>
          )}

          {step === "review" && (
            <Slide key="review">
              <ListChecks className="mb-3 size-8 text-success" />
              <h2 className="mb-1 text-3xl font-black uppercase tracking-tight">Files found</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                {fileCount.video + fileCount.pdf + fileCount.notes + fileCount.other} files ready to
                organize.
              </p>
              <div className="mb-6 grid grid-cols-2 border border-border bg-surface-1 text-center sm:grid-cols-4">
                <Stat label="Videos" value={fileCount.video} />
                <Stat label="PDFs" value={fileCount.pdf} />
                <Stat label="Notes" value={fileCount.notes} />
                <Stat label="Other" value={fileCount.other} />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep("goal")}>Continue</Button>
              </div>
            </Slide>
          )}

          {step === "goal" && (
            <Slide key="goal">
              <Target className="mb-3 size-8 text-primary" />
              <h2 className="mb-1 text-3xl font-black uppercase tracking-tight">Set target</h2>
              <p className="mb-8 text-sm text-muted-foreground">How many minutes per day?</p>
              <div className="mb-2 text-center text-5xl font-black text-foreground">{goal} min</div>
              <Slider
                min={15}
                max={240}
                step={15}
                value={[goal]}
                onValueChange={(v) => setGoal(v[0])}
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>15</span>
                <span>240</span>
              </div>
              <div className="mt-8 flex justify-end">
                <Button onClick={() => setStep("done")}>
                  <Sparkles className="mr-2 size-4" /> Almost there
                </Button>
              </div>
            </Slide>
          )}

          {step === "done" && (
            <Slide key="done">
              <Rocket className="mb-3 size-10 text-primary" />
              <h2 className="mb-1 text-3xl font-black uppercase tracking-tight">Ready</h2>
              <p className="mb-8 text-sm text-muted-foreground">
                Time to organize your first day and start studying.
              </p>
              <Button size="lg" onClick={finish}>
                Let's go 🚀
              </Button>
            </Slide>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Slide({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="w-full border border-border bg-surface-1 p-6 shadow-[10px_10px_0_var(--foreground)] sm:p-8"
    >
      {children}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border p-4 sm:border-r sm:last:border-r-0">
      <div className="text-3xl font-black">{value}</div>
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
