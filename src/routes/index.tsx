import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
      Loading StudyVault…
    </div>
  ),
});
