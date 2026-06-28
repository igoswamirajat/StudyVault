import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ClientOnly } from "@/components/common/ClientOnly";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { exportNotesZip, exportProgressCsv, exportFullBackup, importFullBackup, exportSummariesMarkdownPack, exportSummariesPdf } from "@/services/exportService";
import { resetAllData, resetDriveCache } from "@/services/storageService";
import { isFsSupported, pickDirectory } from "@/services/fileSystemService";
import { extractFolderId, scanFolder, ingestScannedFiles } from "@/services/driveService";
import { setSetting } from "@/services/storageService";
import { getActiveWorkspace } from "@/services/workspaceService";
import { toast } from "sonner";
import { Download, Upload, RefreshCw, Trash2, FolderOpen, Sparkles, Eraser, Unplug } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <SettingsPage />
    </ClientOnly>
  ),
});

const ACCENT_SWATCHES = ["#6C63FF", "#A855F7", "#22D3EE", "#22C55E", "#F59E0B", "#EF4444"];

function SettingsPage() {
  const { settings, update, refresh } = useSettings();
  const navigate = useNavigate();
  const [folderUrl, setFolderUrl] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [scanning, setScanning] = useState(false);

  async function rescan() {
    const id = (settings.driveId as string) || extractFolderId(folderUrl);
    if (!id) {
      toast.error("No Drive folder configured.");
      return;
    }
    setScanning(true);
    const t = toast.loading("Scanning Drive folder…");
    try {
      const files = await scanFolder(id, (settings.driveApiKey as string | null) ?? null);
      const created = await ingestScannedFiles(files);
      toast.success(`Found ${files.length} files (${created.length} new)`, { id: t });
    } catch (e) {
      console.error("Rescan failed", e);
      toast.error(e instanceof Error ? e.message : "Scan failed", { id: t });
    } finally {
      setScanning(false);
    }
  }

  async function connectNew() {
    const id = extractFolderId(folderUrl);
    if (!id) return toast.error("Invalid Drive folder URL");
    const t = toast.loading("Connecting & scanning folder…");
    setScanning(true);
    try {
      await setSetting("driveId", id);
      await setSetting("appInitialized", true);
      const files = await scanFolder(id, (settings.driveApiKey as string | null) ?? null);
      const created = await ingestScannedFiles(files);
      setFolderUrl("");
      await refresh();
      toast.success(`Connected. ${files.length} files (${created.length} new)`, { id: t });
    } catch (e) {
      console.error("Connect failed", e);
      toast.error(e instanceof Error ? e.message : "Connect failed", { id: t });
    } finally {
      setScanning(false);
    }
  }

  async function pickOfflineFolder() {
    if (!isFsSupported()) {
      toast.error("Your browser doesn't support File System Access. Use Chrome, Edge, or Electron.");
      return;
    }
    const handle = await pickDirectory();
    if (handle) {
      toast.success("Offline folder selected");
      await refresh();
    }
  }

  async function doImport(file: File) {
    try {
      await importFullBackup(file);
      toast.success("Backup restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  }

  async function doReset() {
    if (resetConfirm !== "RESET") {
      toast.error('Type "RESET" to confirm.');
      return;
    }
    await resetAllData();
    toast.success("All data cleared");
    navigate({ to: "/onboarding" });
  }

  async function doDisconnectDrive() {
    if (!confirm("Disconnect Drive folder and clear cached library for this workspace?\n\nNotes and flashcards are preserved.")) return;
    await resetDriveCache();
    toast.success("Drive folder disconnected. Library cache cleared.");
    await refresh();
    navigate({ to: "/onboarding" });
  }

  async function doResetWorkspace() {
    const ws = getActiveWorkspace();
    const label = ws?.name ?? "this workspace";
    if (!confirm(`Wipe ALL data in "${label}"?\n\nThis clears resources, folders, notes, flashcards, progress, and settings for this workspace only. Other workspaces are untouched.`)) return;
    await resetAllData();
    toast.success(`"${label}" reset`);
    navigate({ to: "/onboarding" });
  }

  const activeWs = getActiveWorkspace();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure StudyVault.</p>
      </div>

      <Section title="Workspace">
        <Field label="Active workspace">
          <div className="flex items-center gap-2">
            <code className="rounded bg-surface-2 px-2 py-1 text-xs">{activeWs?.name ?? "None"}</code>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/workspaces" })}>
              Switch / sign out
            </Button>
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={doDisconnectDrive}>
            <Unplug className="mr-2 size-4" /> Disconnect Drive folder
          </Button>
          <Button variant="destructive" onClick={doResetWorkspace}>
            <Eraser className="mr-2 size-4" /> Reset this workspace
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          These actions affect only the current workspace's IndexedDB. Other workspaces stay intact.
        </p>
      </Section>

      <Section title="Drive">
        <Field label="Current folder ID">
          <code className="rounded bg-surface-2 px-2 py-1 text-xs">{(settings.driveId as string) || "Not connected"}</code>
        </Field>
        <Field label="Connect a new folder">
          <div className="flex gap-2">
            <Input
              placeholder="https://drive.google.com/drive/folders/…"
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
            />
            <Button onClick={connectNew} disabled={!folderUrl.trim()}>
              Connect
            </Button>
          </div>
        </Field>
        <Button variant="outline" onClick={rescan} disabled={scanning}>
          <RefreshCw className={`mr-2 size-4 ${scanning ? "animate-spin" : ""}`} /> Re-scan folder
        </Button>
      </Section>

      <Section title="Study">
        <Field label={`Daily goal: ${(settings.dailyGoalMinutes as number) ?? 60} minutes`}>
          <Slider
            min={15}
            max={240}
            step={15}
            value={[(settings.dailyGoalMinutes as number) ?? 60]}
            onValueChange={(v) => update("dailyGoalMinutes", v[0])}
          />
        </Field>
        <Toggle
          label="Auto-advance after completion"
          desc="Automatically open the next resource when one is marked done."
          checked={Boolean(settings.autoAdvance)}
          onChange={(v) => update("autoAdvance", v)}
        />
        <Toggle
          label="Resume videos"
          desc="Pick up where you left off when reopening a video."
          checked={Boolean(settings.resumeVideos)}
          onChange={(v) => update("resumeVideos", v)}
        />
        <Toggle
          label="Show session timer"
          desc="Display the live timer in the Study Room header."
          checked={Boolean(settings.showTimerInSession)}
          onChange={(v) => update("showTimerInSession", v)}
        />
      </Section>

      <Section title="Offline">
        <Toggle
          label="Auto-download next day"
          desc="Download tomorrow's resources after finishing today's last one."
          checked={Boolean(settings.autoDownloadNext)}
          onChange={(v) => update("autoDownloadNext", v)}
        />
        <Field label="Offline folder">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={pickOfflineFolder}>
              <FolderOpen className="mr-2 size-4" />
              {settings.offlineFolderGranted ? "Change folder" : "Pick folder"}
            </Button>
            {Boolean(settings.offlineFolderGranted) && (
              <span className="text-xs text-success">Folder linked</span>
            )}
          </div>
        </Field>
      </Section>

      <Section title="Appearance">
        <Field label="Accent color">
          <div className="flex flex-wrap gap-2">
            {ACCENT_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => update("accentColor", c)}
                aria-label={`Accent ${c}`}
                className={`size-8 rounded-lg ring-offset-2 ring-offset-background transition-all ${
                  settings.accentColor === c ? "ring-2 ring-foreground" : ""
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Quiz">
        <Toggle
          label="Quiz timer"
          desc="Show a countdown bar per question."
          checked={Boolean(settings.quizTimerEnabled)}
          onChange={(v) => update("quizTimerEnabled", v)}
        />
        <p className="text-xs text-muted-foreground">
          <Sparkles className="mr-1 inline size-3" />
          AI quizzes & flashcards are powered by Lovable AI from your summary notes.
        </p>
      </Section>

      <Section title="Data">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportSummariesMarkdownPack}>
            <Download className="mr-2 size-4" /> Summary pack (.zip)
          </Button>
          <Button variant="outline" onClick={exportSummariesPdf}>
            <Download className="mr-2 size-4" /> Summaries (.pdf)
          </Button>
          <Button variant="outline" onClick={exportNotesZip}>
            <Download className="mr-2 size-4" /> All notes (.zip)
          </Button>
          <Button variant="outline" onClick={exportProgressCsv}>
            <Download className="mr-2 size-4" /> Progress (.csv)
          </Button>
          <Button variant="outline" onClick={exportFullBackup}>
            <Download className="mr-2 size-4" /> Full backup (.json)
          </Button>
          <label className="inline-flex">
            <Button variant="outline" asChild>
              <span>
                <Upload className="mr-2 size-4" /> Import backup
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void doImport(f);
                    e.target.value = "";
                  }}
                />
              </span>
            </Button>
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-2 text-sm font-medium text-destructive">Reset all data</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Clears every resource, note, session, and setting. Cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder='Type "RESET"'
              className="h-9 max-w-[160px]"
            />
            <Button variant="destructive" onClick={doReset}>
              <Trash2 className="mr-2 size-4" /> Reset everything
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface-1 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
