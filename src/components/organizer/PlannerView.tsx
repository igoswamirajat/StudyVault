import { useMemo, useState } from "react";
import { type Resource, type Day, getDb } from "@/db/schema";
import { useDroppable } from "@dnd-kit/core";
import { CalendarDays, Plus, Trash2, Settings, Sparkles, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { setPlaylist } from "@/lib/playlist";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useDraggable } from "@dnd-kit/core";

export function PlannerView({ resources, days }: { resources: Resource[]; days: Day[] }) {
  const [addingDay, setAddingDay] = useState(false);

  const addDay = async () => {
    const title = window.prompt("Enter Day Title (e.g. Day 1, Monday)");
    if (!title) return;
    const db = getDb();
    const nextNumber = days.length > 0 ? Math.max(...days.map((d) => d.number)) + 1 : 1;
    await db.days.put({
      number: nextNumber,
      title,
      createdAt: Date.now()
    });
    toast.success(`Added ${title}`);
  };

  const deleteDay = async (dayNumber: number) => {
    if (!window.confirm("Delete this day? Resources will remain unassigned to a day.")) return;
    const db = getDb();
    await db.transaction("rw", db.days, db.resources, async () => {
      await db.days.delete(dayNumber);
      const toUpdate = await db.resources.where("dayAssignment").equals(dayNumber).toArray();
      for (const r of toUpdate) {
        await db.resources.update(r.id, { dayAssignment: null });
      }
    });
    toast.success("Day deleted");
  };

  const unassignedResources = useMemo(() => resources.filter(r => r.dayAssignment == null), [resources]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      {/* Sidebar: Unassigned Resources */}
      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-hidden border-b border-border bg-surface-1/40 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 p-4">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Unscheduled</h2>
        </div>
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-1">
            {unassignedResources.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">All resources are scheduled!</p>
            )}
            {unassignedResources.map(r => (
              <DraggableResource key={r.id} resource={r} />
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Area: Days Timeline */}
      <section className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-surface-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI Planner</h1>
            <p className="text-sm text-muted-foreground">Drag and drop resources into days.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addDay}>
              <Plus className="mr-2 size-4" /> Add Day
            </Button>
          </div>
        </div>

        {days.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-16 text-muted-foreground">
            <CalendarDays className="mb-4 size-10 opacity-20" />
            <p className="text-sm">No days configured yet.</p>
            <Button variant="link" onClick={addDay} className="mt-2 text-primary">Create your first day</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {days.map(d => (
              <DayBlock key={d.number} day={d} resources={resources.filter(r => r.dayAssignment === d.number)} onDelete={() => deleteDay(d.number)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DayBlock({ day, resources, onDelete }: { day: Day; resources: Resource[], onDelete: () => void }) {
  const navigate = useNavigate();
  const { isOver, setNodeRef } = useDroppable({
    id: `day-target:${day.number}`,
  });

  const handleStudy = () => {
    if (resources.length === 0) return;
    setPlaylist({
      label: day.title,
      ids: resources.map((r) => r.id),
    });
    navigate({ to: "/study/$resourceId", params: { resourceId: resources[0].id } });
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        type: "day",
        id: day.number,
        title: day.title,
        resourceIds: resources.map((r) => r.id),
      })
    );
  };

  return (
    <div
      ref={setNodeRef}
      draggable={true}
      onDragStart={handleDragStart}
      className={`relative rounded-xl border p-4 transition-colors cursor-grab ${isOver ? "border-primary bg-primary/5" : "border-border bg-background"}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{day.title}</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-primary" onClick={handleStudy} title="Study this day">
            <Play className="size-3.5 fill-current" />
          </Button>
          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Delete day">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-1 min-h-[50px]">
        {resources.length === 0 && (
          <div className="rounded border border-dashed border-border/50 py-4 text-center text-xs text-muted-foreground">
            Drop resources here
          </div>
        )}
        {resources.map(r => (
          <DraggableResource key={r.id} resource={r} showType />
        ))}
      </div>
    </div>
  );
}

function DraggableResource({ resource, showType = false }: { resource: Resource; showType?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: resource.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab items-center justify-between gap-2 rounded border border-border/50 bg-background px-3 py-2 text-sm shadow-sm transition-shadow hover:bg-surface-2 ${isDragging ? "opacity-50 ring-2 ring-primary" : ""}`}
    >
      <span className="truncate">{resource.name}</span>
      {showType && <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{resource.type}</span>}
    </div>
  );
}
