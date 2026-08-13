import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { Globe, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDb, type Resource } from "@/db/schema";
import { extractWebArticleAI } from "@/lib/ai.functions";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";

interface Props {
  onImported?: (resourceId: string) => void;
  defaultFolderPath?: string;
}

export function WebImportDialog({ onImported, defaultFolderPath = "" }: Props) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const { settings } = useSettings();

  async function submit() {
    if (!url) return;
    setError(null);
    setLoading(true);
    try {
      // Extract rich content using AI
      const result = await extractWebArticleAI({
        data: {
          url,
          provider: (settings.aiProvider as string) || undefined,
          endpoint: (settings.openaiEndpoint as string) || undefined,
          apiKey: (settings.openaiApiKey as string) || undefined,
          model: (settings.aiModel as string) || undefined,
        },
      });

      if (!result?.markdown) throw new Error("Failed to extract article content.");

      const resourceId = crypto.randomUUID();
      
      // Try to extract a title from the URL or domain, the AI doesn't return a title yet.
      // Alternatively, we could ask the AI for a title. For now, use the host.
      let title = "Web Article";
      try {
        title = new URL(url).hostname.replace("www.", "");
      } catch {}

      const resource: Resource = {
        id: resourceId,
        name: title,
        type: "web",
        mimeType: "text/html",
        driveId: "",
        size: 0,
        dayAssignment: null,
        orderIndex: Date.now(),
        isDownloaded: true, // Content is stored in notes
        localPath: null,
        thumbnailUrl: null,
        addedAt: Date.now(),
        lastOpenedAt: null,
        durationSeconds: null,
        folderPath: defaultFolderPath,
        status: "active",
        tags: [],
        source: "web",
        url: url,
      };

      await getDb().resources.put(resource);

      // Create the rich note that holds the content
      const noteId = crypto.randomUUID();
      await getDb().notes.put({
        id: noteId,
        resourceId: resourceId,
        dayNumber: null,
        isGlobal: false,
        isSummary: false,
        title: "Article Content",
        content: result.markdown,
        contentMarkdown: result.markdown,
        tags: [],
        linkedTimestamp: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ownerId: "system",
      });

      toast.success("Web article imported successfully.");
      setUrl("");
      onImported?.(resourceId);
      
      navigate({ to: "/study/$resourceId", params: { resourceId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
      className="space-y-3 rounded border border-border bg-surface-2 p-3"
    >
      <div className="flex items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center bg-blue-600 text-white rounded">
          <Globe className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Import Web Article</p>
          <p className="text-[11px] text-muted-foreground">
            StudyVault will fetch the page and extract it as a rich document for offline studying.
          </p>
        </div>
      </div>
      
      <div className="flex flex-col gap-2">
        <Input
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="h-8 bg-surface-1 text-xs"
          autoFocus
          disabled={loading}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button size="sm" onClick={submit} disabled={loading || !url} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 size-3.5 animate-spin" /> Extracting...
            </>
          ) : (
            "Import Article"
          )}
        </Button>
      </div>
    </motion.div>
  );
}
