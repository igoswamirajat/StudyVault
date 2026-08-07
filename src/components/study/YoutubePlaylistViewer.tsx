import { ExternalLink, KeyRound, ListVideo } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { YoutubePlaylist } from "@/db/schema";

interface Props {
  playlist: YoutubePlaylist;
}

export function YoutubePlaylistViewer({ playlist }: Props) {
  const reducedMotion = useReducedMotion();
  const embedUrl = `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlist.playlistId)}&rel=0&modestbranding=1&playsinline=1`;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
      className="flex h-[calc(100vh-48px)] flex-col bg-black"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-surface-1 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <ListVideo className="size-3.5" /> YouTube playlist
          </p>
          <h1 className="truncate text-sm font-semibold text-foreground">{playlist.title}</h1>
        </div>
        <Button asChild size="sm" variant="ghost">
          <a href={playlist.url} target="_blank" rel="noreferrer" className="text-muted-foreground">
            <ExternalLink className="mr-1.5 size-3.5" /> YouTube
          </a>
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-black p-2 sm:p-5">
        <div className="mx-auto size-full max-w-6xl overflow-hidden bg-black shadow-2xl">
          <iframe
            title={playlist.title}
            src={embedUrl}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
            className="size-full border-0"
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 bg-surface-1 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Privacy-first mode. YouTube controls playlist order and playback. No API key or account
          access used.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/settings">
            <KeyRound className="mr-1.5 size-3.5" /> Enhance course
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
