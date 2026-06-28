import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";

export const Route = createFileRoute("/study/")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <StudyLanding />
    </ClientOnly>
  ),
});

function StudyLanding() {
  const navigate = useNavigate();
  const resources = (useLiveQuery(() => getDb().resources.orderBy("lastOpenedAt").reverse().limit(1).toArray(), []) ?? []);
  if (resources.length > 0) {
    navigate({ to: "/study/$resourceId", params: { resourceId: resources[0].id }, replace: true });
    return null;
  }
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h2 className="mb-2 text-xl font-semibold">Pick a resource to start studying</h2>
      <p className="mb-4 text-sm text-muted-foreground">Open any item from your Library.</p>
      <button
        onClick={() => navigate({ to: "/library" })}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Go to Library
      </button>
    </div>
  );
}
