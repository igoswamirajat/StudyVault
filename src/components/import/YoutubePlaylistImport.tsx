import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, KeyRound, ListVideo, Loader2, Youtube } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  importYoutubePlaylist,
  saveYoutubePlaylist,
  type YoutubeImportResult,
} from "@/services/youtubeService";
import { setSetting } from "@/services/storageService";
import { toast } from "sonner";

interface Props {
  initialApiKey?: string | null;
  onImported?: (result: YoutubeImportResult) => void;
  autoOpen?: boolean;
}

export function YoutubePlaylistImport({ initialApiKey, onImported, autoOpen = true }: Props) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState(initialApiKey ?? "");
  const [mode, setMode] = useState<"play" | "enhance">("play");
  const [saveKey, setSaveKey] = useState(false);
  const [showKey, setShowKey] = useState(Boolean(initialApiKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === "play"
          ? await saveYoutubePlaylist(url)
          : await importYoutubePlaylist(url, apiKey, { saveApiKey: saveKey });
      toast.success(
        mode === "play"
          ? "Playlist saved. YouTube will handle playback."
          : `${result.imported} lessons imported from ${result.title}`,
      );
      setUrl("");
      onImported?.(result);
      if (autoOpen && result.mode === "embed") {
        navigate({ to: "/youtube/$playlistId", params: { playlistId: result.playlistId } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "YouTube import failed.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function forgetSavedKey() {
    await setSetting("youtubeApiKey", null);
    setApiKey("");
    setSaveKey(false);
    setShowKey(false);
    toast.success("Saved YouTube API key removed");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
      className="space-y-3 rounded border border-border bg-surface-2 p-3"
    >
      <div className="flex items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center bg-[#ff0033] text-white">
          <Youtube className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Import YouTube playlist</p>
          <p className="text-[11px] text-muted-foreground">
            API key optional. Play directly through YouTube, or enhance into StudyVault lessons.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded border border-border bg-surface-1 p-1">
        <button
          type="button"
          onClick={() => setMode("play")}
          className={`rounded px-2 py-2 text-left text-[11px] transition-colors ${
            mode === "play"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="block font-semibold">Play only</span>
          <span className="mt-0.5 block opacity-75">No key required</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("enhance")}
          className={`rounded px-2 py-2 text-left text-[11px] transition-colors ${
            mode === "enhance"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="block font-semibold">Enhance course</span>
          <span className="mt-0.5 block opacity-75">Lessons + progress</span>
        </button>
      </div>
      <Input
        placeholder="https://youtube.com/playlist?list=…"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        className="h-10"
        onKeyDown={(event) => {
          if (event.key === "Enter" && url.trim() && !loading) void submit();
        }}
      />
      {mode === "enhance" && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowKey((value) => !value)}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <KeyRound className="size-3.5" />
            {showKey ? "Hide API key" : "Add YouTube API key"}
          </button>
          {showKey && (
            <>
              <Input
                type="password"
                placeholder="AIza…"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className="h-9 font-mono text-xs"
              />
              <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={saveKey}
                  onChange={(event) => setSaveKey(event.target.checked)}
                />
                Save key on this device for future imports
              </label>
            </>
          )}
          {initialApiKey && (
            <button
              type="button"
              onClick={() => void forgetSavedKey()}
              className="text-[10px] text-destructive transition-colors hover:text-destructive/80"
            >
              Remove saved key
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">
            Public playlist metadata only. No YouTube login, watch history, or account permissions.
          </p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button className="w-full" onClick={() => void submit()} disabled={!url.trim() || loading}>
        {loading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <ListVideo className="mr-2 size-4" />
        )}
        {loading
          ? mode === "play"
            ? "Opening playlist…"
            : "Enhancing playlist…"
          : mode === "play"
            ? "Play playlist"
            : "Enhance into lessons"}
      </Button>
    </motion.div>
  );
}
