import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { YoutubePlaylistViewer } from "@/components/study/YoutubePlaylistViewer";

export const Route = createFileRoute("/youtube/$playlistId")({
  component: () => (
    <ClientOnly fallback={<div className="min-h-screen bg-black" />}>
      <YoutubePlaylistPage />
    </ClientOnly>
  ),
});

function YoutubePlaylistPage() {
  const { playlistId } = Route.useParams();
  const playlist = useLiveQuery(() => getDb().youtube_playlists.get(playlistId), [playlistId]);

  if (playlist === undefined) return <div className="min-h-screen bg-black" />;
  if (!playlist) return <div className="p-8 text-muted-foreground">Playlist not found.</div>;
  return <YoutubePlaylistViewer playlist={playlist} />;
}
