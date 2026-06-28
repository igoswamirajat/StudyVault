import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { getDb, type Note, type Resource } from "@/db/schema";
import { Library, Play, NotebookText, BarChart3, CalendarDays, Settings, FileText, Sparkles } from "lucide-react";

/** Global ⌘K / Ctrl-K palette: jump to any resource, note, or nav route. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const resources = (useLiveQuery(
    () => (open ? getDb().resources.limit(200).toArray() : Promise.resolve([] as Resource[])),
    [open],
  ) ?? []) as Resource[];
  const notes = (useLiveQuery(
    () => (open ? getDb().notes.orderBy("updatedAt").reverse().limit(100).toArray() : Promise.resolve([] as Note[])),
    [open],
  ) ?? []) as Note[];

  function go(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search resources, notes, pages…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go(() => navigate({ to: "/library" }))}>
            <Library className="mr-2 size-4" /> Library
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/organizer" }))}>
            <CalendarDays className="mr-2 size-4" /> Organizer
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/study" }))}>
            <Play className="mr-2 size-4" /> Study Room
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/notes" }))}>
            <NotebookText className="mr-2 size-4" /> Notes
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/progress" }))}>
            <BarChart3 className="mr-2 size-4" /> Progress
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/settings" }))}>
            <Settings className="mr-2 size-4" /> Settings
          </CommandItem>
        </CommandGroup>

        {resources.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Resources">
              {resources.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`resource ${r.name} ${r.type}`}
                  onSelect={() =>
                    go(() => navigate({ to: "/study/$resourceId", params: { resourceId: r.id } }))
                  }
                >
                  <FileText className="mr-2 size-4" />
                  <span className="truncate">{r.name}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
                    {r.type}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {notes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Notes">
              {notes.map((n) => (
                <CommandItem
                  key={n.id}
                  value={`note ${n.title} ${n.contentMarkdown.slice(0, 200)}`}
                  onSelect={() =>
                    go(() =>
                      n.resourceId
                        ? navigate({ to: "/study/$resourceId", params: { resourceId: n.resourceId } })
                        : navigate({ to: "/notes" }),
                    )
                  }
                >
                  {n.isSummary ? <Sparkles className="mr-2 size-4" /> : <NotebookText className="mr-2 size-4" />}
                  <span className="truncate">{n.title || "Untitled"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
