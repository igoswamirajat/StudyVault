import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ClientOnly } from "@/components/common/ClientOnly";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  exportNotesZip,
  exportProgressCsv,
  exportFullBackup,
  importFullBackup,
  exportSummariesMarkdownPack,
  exportSummariesPdf,
} from "@/services/exportService";
import { resetAllData, resetDriveCache } from "@/services/storageService";
import { isFsSupported, pickDirectory } from "@/services/fileSystemService";
import {
  isBackupSupported,
  pickBackupFolder,
  performAutoBackup,
  disableAutoBackup,
} from "@/services/autoBackupService";
import { extractFolderId, scanFolder, ingestScannedFiles } from "@/services/driveService";
import { setSetting } from "@/services/storageService";
import {
  checkTelegramHealth,
  scanTelegramChat,
  ingestTelegramFiles,
  sendTelegramOtp,
  verifyTelegramOtp,
} from "@/services/telegramService";
import { looksLikeChatId } from "@/services/telegramParse";
import { getActiveWorkspace } from "@/services/workspaceService";
import { toast } from "sonner";
import {
  Download,
  Upload,
  RefreshCw,
  Trash2,
  FolderOpen,
  Sparkles,
  Eraser,
  Unplug,
  Send,
  HardDrive,
  Brain,
} from "lucide-react";

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
  const [tgApiId, setTgApiId] = useState((settings.telegramApiId as string) ?? "");
  const [tgApiHash, setTgApiHash] = useState((settings.telegramApiHash as string) ?? "");
  const [tgPhone, setTgPhone] = useState("");
  const [tgOtp, setTgOtp] = useState("");
  const [tgPhoneCodeHash, setTgPhoneCodeHash] = useState("");
  const [tgPendingSession, setTgPendingSession] = useState("");
  const [tgChatId, setTgChatId] = useState((settings.telegramChatId as string) ?? "");
  const [tgScanning, setTgScanning] = useState(false);
  const [tgStep, setTgStep] = useState<"credentials" | "otp" | "ready">(
    (settings.telegramSession as string) ? "ready" : "credentials",
  );

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

  async function sendTgCode() {
    const apiId = Number(tgApiId);
    if (!apiId || !tgApiHash.trim() || !tgPhone.trim()) {
      return toast.error("Fill in API ID, API Hash, and phone number");
    }
    const t = toast.loading("Sending OTP…");
    try {
      const res = await sendTelegramOtp(apiId, tgApiHash.trim(), tgPhone.trim());
      if (!res.ok) {
        toast.error(res.error ?? "Failed to send code", { id: t });
        return;
      }
      setTgPhoneCodeHash(res.phoneCodeHash!);
      setTgPendingSession(res.pendingSession!);
      await setSetting("telegramApiId", apiId);
      await setSetting("telegramApiHash", tgApiHash.trim());
      setTgStep("otp");
      toast.success("OTP sent to your Telegram app", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed", { id: t });
    }
  }

  async function verifyTgCode() {
    const apiId = Number(tgApiId);
    if (!tgOtp.trim()) return toast.error("Enter the OTP");
    const t = toast.loading("Verifying…");
    try {
      const res = await verifyTelegramOtp(
        apiId,
        tgApiHash.trim(),
        tgPhone.trim(),
        tgOtp.trim(),
        tgPhoneCodeHash,
        tgPendingSession,
      );
      if (!res.ok) {
        toast.error(res.error ?? "Verification failed", { id: t });
        return;
      }
      await setSetting("telegramSession", res.session!);
      await refresh();
      setTgStep("ready");
      toast.success("Telegram session established", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed", { id: t });
    }
  }

  async function scanTelegram() {
    const chatId = (settings.telegramChatId as string) ?? tgChatId.trim();
    if (!chatId) return toast.error("Enter a chat ID first");
    if (!looksLikeChatId(chatId)) return toast.error("Invalid chat ID format");
    await setSetting("telegramChatId", chatId);
    setTgScanning(true);
    const t = toast.loading("Scanning Telegram chat…");
    try {
      const files = await scanTelegramChat("", chatId);
      const result = await ingestTelegramFiles(files);
      await setSetting("appInitialized", true);
      await refresh();
      toast.success(
        `Found ${files.length} files (${result.imported} new, ${result.skipped} skipped)`,
        { id: t },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed", { id: t });
    } finally {
      setTgScanning(false);
    }
  }

  async function disconnectTelegram() {
    if (!confirm("Disconnect Telegram? Resources already imported will remain.")) return;
    await setSetting("telegramApiId", null);
    await setSetting("telegramApiHash", null);
    await setSetting("telegramSession", null);
    await setSetting("telegramChatId", null);
    await setSetting("telegramChatTitle", null);
    await refresh();
    setTgApiId("");
    setTgApiHash("");
    setTgChatId("");
    setTgStep("credentials");
    toast.success("Telegram disconnected");
  }

  async function pickOfflineFolder() {
    if (!isFsSupported()) {
      toast.error(
        "Your browser doesn't support File System Access. Use Chrome, Edge, or Electron.",
      );
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
    if (
      !confirm(
        "Disconnect Drive folder and clear cached library for this workspace?\n\nNotes and flashcards are preserved.",
      )
    )
      return;
    await resetDriveCache();
    toast.success("Drive folder disconnected. Library cache cleared.");
    await refresh();
    navigate({ to: "/onboarding" });
  }

  async function doResetWorkspace() {
    const ws = getActiveWorkspace();
    const label = ws?.name ?? "this workspace";
    if (
      !confirm(
        `Wipe ALL data in "${label}"?\n\nThis clears resources, folders, notes, flashcards, progress, and settings for this workspace only. Other workspaces are untouched.`,
      )
    )
      return;
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
            <code className="rounded bg-surface-2 px-2 py-1 text-xs">
              {activeWs?.name ?? "None"}
            </code>
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
          <code className="rounded bg-surface-2 px-2 py-1 text-xs">
            {(settings.driveId as string) || "Not connected"}
          </code>
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

      <Section title="Telegram">
        <Field label="Status">
          <code className="rounded bg-surface-2 px-2 py-1 text-xs">
            {(settings.telegramSession as string)
              ? `Logged in${(settings.telegramChatTitle as string) ? ` · ${settings.telegramChatTitle}` : ""}`
              : "Not connected"}
          </code>
        </Field>

        {tgStep === "credentials" && (
          <>
            <p className="text-xs text-muted-foreground">
              Get your API ID and Hash from{" "}
              <a
                href="https://my.telegram.org"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                my.telegram.org
              </a>{" "}
              → "API development tools". This lets you read any channel you're a member of.
            </p>
            <Field label="API ID">
              <Input
                placeholder="1234567"
                value={tgApiId}
                onChange={(e) => setTgApiId(e.target.value)}
              />
            </Field>
            <Field label="API Hash">
              <Input
                type="password"
                placeholder="0123456789abcdef..."
                value={tgApiHash}
                onChange={(e) => setTgApiHash(e.target.value)}
              />
            </Field>
            <Field label="Phone number">
              <Input
                placeholder="+91..."
                value={tgPhone}
                onChange={(e) => setTgPhone(e.target.value)}
              />
            </Field>
            <Button
              onClick={sendTgCode}
              disabled={!tgApiId.trim() || !tgApiHash.trim() || !tgPhone.trim()}
            >
              <Send className="mr-2 size-4" /> Send OTP
            </Button>
          </>
        )}

        {tgStep === "otp" && (
          <>
            <p className="text-xs text-muted-foreground">
              Enter the code sent to your Telegram app (not SMS).
            </p>
            <Field label="OTP Code">
              <Input placeholder="12345" value={tgOtp} onChange={(e) => setTgOtp(e.target.value)} />
            </Field>
            <Button onClick={verifyTgCode} disabled={!tgOtp.trim()}>
              Verify & Login
            </Button>
          </>
        )}

        {tgStep === "ready" && (
          <>
            <Field label="Chat ID">
              <div className="space-y-1">
                <Input
                  placeholder="@channel, -100XXXXXXXXXX, or t.me/channel"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use -100 prefix + group ID, @username, or numeric chat ID
                </p>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={scanTelegram} disabled={tgScanning || !tgChatId.trim()}>
                <RefreshCw className={`mr-2 size-4 ${tgScanning ? "animate-spin" : ""}`} /> Scan
                chat
              </Button>
              <Button variant="outline" onClick={disconnectTelegram}>
                <Unplug className="mr-2 size-4" /> Disconnect
              </Button>
            </div>
          </>
        )}
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

      <Section title="Auto-Backup">
        <p className="text-xs text-muted-foreground">
          Automatically save your workspace data to a folder you choose. Use it to restore on
          another device.
        </p>
        <Field label="Backup folder">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!isBackupSupported()) {
                  toast.error(
                    "Your browser doesn't support File System Access. Use Chrome or Edge.",
                  );
                  return;
                }
                const h = await pickBackupFolder();
                if (h) {
                  toast.success("Backup folder selected — auto-backup is now active");
                  await refresh();
                }
              }}
            >
              <HardDrive className="mr-2 size-4" />
              {settings.autoBackupEnabled ? "Change folder" : "Pick backup folder"}
            </Button>
            {Boolean(settings.autoBackupEnabled) && (
              <span className="text-xs text-green-400">Active</span>
            )}
          </div>
        </Field>
        {Boolean(settings.autoBackupEnabled) && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const res = await performAutoBackup();
                if (res.success) toast.success("Backup saved");
                else toast.error(res.error ?? "Backup failed");
                await refresh();
              }}
            >
              Backup now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await disableAutoBackup();
                toast.success("Auto-backup disabled");
                await refresh();
              }}
            >
              Disable
            </Button>
            {Boolean(settings.lastBackupAt) && (
              <span className="self-center text-xs text-muted-foreground">
                Last backup: {new Date(settings.lastBackupAt as number).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </Section>

      <Section title="AI">
        <p className="text-xs text-muted-foreground">
          Configure your AI provider for summaries, quizzes, flashcards, auto-notes, the Doubt
          Buster, and the in-session assistant. Supports any OpenAI-compatible endpoint (OpenAI,
          OpenRouter, Ollama, LM Studio) or Gemini. Video understanding samples on-screen frames, so
          pick a vision-capable model — Gemini (<code>gemini-3-flash-preview</code>) is recommended.
        </p>
        <Field label="Provider">
          <select
            className="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm"
            value={(settings.aiProvider as string) ?? "openai-compatible"}
            onChange={async (e) => {
              const provider = e.target.value;
              await update("aiProvider", provider);
              // Auto-fill sensible defaults so the user never has to type the
              // endpoint/model again. Only fill blanks — never clobber a value
              // the user already set. Both persist to IndexedDB immediately.
              const defaults =
                provider === "gemini"
                  ? {
                      openaiEndpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
                      aiModel: "gemini-3-flash-preview",
                    }
                  : { openaiEndpoint: "https://api.openai.com/v1", aiModel: "gpt-4o-mini" };
              if (!(settings.openaiEndpoint as string)?.trim())
                await update("openaiEndpoint", defaults.openaiEndpoint);
              if (!(settings.aiModel as string)?.trim()) await update("aiModel", defaults.aiModel);
            }}
          >
            <option value="openai-compatible">OpenAI-Compatible</option>
            <option value="gemini">Gemini (free tier)</option>
          </select>
        </Field>
        <Field label="Endpoint URL (optional — auto-filled)">
          <Input
            placeholder={
              (settings.aiProvider as string) === "gemini"
                ? "https://generativelanguage.googleapis.com/v1beta/openai"
                : "https://api.openai.com/v1"
            }
            value={(settings.openaiEndpoint as string) ?? ""}
            onChange={(e) => update("openaiEndpoint", e.target.value)}
          />
        </Field>
        <Field label="API Key">
          <Input
            type="password"
            placeholder="sk-… or AIza…"
            value={(settings.openaiApiKey as string) ?? ""}
            onChange={(e) => update("openaiApiKey", e.target.value)}
          />
        </Field>
        <Field label="Model">
          <Input
            placeholder={
              (settings.aiProvider as string) === "gemini"
                ? "gemini-3-flash-preview"
                : "gpt-4o-mini"
            }
            value={(settings.aiModel as string) ?? ""}
            onChange={(e) => update("aiModel", e.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const provider = (settings.aiProvider as string) ?? "openai-compatible";
            const endpoint =
              (settings.openaiEndpoint as string)?.trim() ||
              (provider === "gemini"
                ? "https://generativelanguage.googleapis.com/v1beta/openai"
                : "https://api.openai.com/v1");
            const key = (settings.openaiApiKey as string) || "";
            if (!key) {
              toast.error("Enter your API key first");
              return;
            }
            const t = toast.loading("Testing connection…");
            try {
              const res = await fetch(`${endpoint.replace(/\/$/, "")}/models`, {
                headers: { Authorization: `Bearer ${key}` },
              });
              if (res.ok) toast.success("Connection successful", { id: t });
              else toast.error(`Failed: ${res.status} ${res.statusText}`, { id: t });
            } catch (e) {
              toast.error(`Connection error: ${e instanceof Error ? e.message : "Unknown"}`, {
                id: t,
              });
            }
          }}
        >
          <Brain className="mr-2 size-4" /> Test connection
        </Button>
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
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
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
