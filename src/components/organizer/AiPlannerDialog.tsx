import { useState } from "react";
import { type Resource, type Day, getDb } from "@/db/schema";
import { aiGeneratePlanner } from "@/services/aiService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export function AiPlannerDialog({
  open,
  onOpenChange,
  resources,
  days,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
  days: Day[];
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAutoSchedule = async () => {
    const unassigned = resources.filter((r) => r.dayAssignment == null);
    if (unassigned.length === 0) {
      toast.info("All resources are already assigned to days.");
      return;
    }

    setLoading(true);
    try {
      const result = await aiGeneratePlanner(
        unassigned.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          durationSeconds: r.durationSeconds,
        })),
        prompt || "Distribute these resources evenly into sequential days."
      );

      if (result && result.days) {
        const db = getDb();
        await db.transaction("rw", db.days, db.resources, async () => {
          for (const d of result.days) {
            // Check if day exists, if not create it
            let dayEntity = await db.days.get(d.dayNumber);
            if (!dayEntity) {
              dayEntity = {
                number: d.dayNumber,
                title: d.title || `Day ${d.dayNumber}`,
                createdAt: Date.now(),
              };
              await db.days.put(dayEntity);
            }
            // Assign resources
            for (const rId of d.resourceIds) {
              await db.resources.update(rId, { dayAssignment: dayEntity.number });
            }
          }
        });
        toast.success("Schedule generated successfully! 🎉");
        onOpenChange(false);
        setPrompt("");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to generate schedule.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-indigo-500" /> AI Auto-Schedule
          </DialogTitle>
          <DialogDescription>
            Let AI organize your unscheduled resources. Tell it how you prefer to study (e.g. "I want to study 2 hours a day max").
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g. Spread these out over the next 5 days..."
            className="min-h-[100px] resize-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAutoSchedule} disabled={loading} className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 border-none shadow-sm">
            {loading ? "Thinking..." : "Generate Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
