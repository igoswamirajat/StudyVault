import { useState } from "react";
import { Flag, Pin, Repeat, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getDb, type RevisionFlag } from "@/db/schema";
import { toast } from "sonner";

const OPTIONS: Array<{ key: RevisionFlag; label: string; icon: typeof Pin; tone: string }> = [
  { key: "important", label: "Important", icon: Pin, tone: "text-primary" },
  { key: "revision", label: "Revision", icon: Repeat, tone: "text-warning" },
  { key: "difficult", label: "Difficult", icon: AlertTriangle, tone: "text-destructive" },
  { key: "done", label: "Done", icon: CheckCircle2, tone: "text-success" },
];

export function flagMeta(flag: RevisionFlag | null | undefined) {
  return OPTIONS.find((o) => o.key === flag) ?? null;
}

export function RevisionFlagButton({
  resourceId,
  flag,
  size = "sm",
}: {
  resourceId: string;
  flag: RevisionFlag | null | undefined;
  size?: "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const current = flagMeta(flag);

  async function setFlag(next: RevisionFlag | null) {
    await getDb().resources.update(resourceId, { revisionFlag: next });
    setOpen(false);
    if (next) toast.success(`Flagged: ${flagMeta(next)?.label}`);
    else toast("Flag cleared");
  }

  const Icon = current?.icon ?? Flag;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          className={cn(
            "inline-flex items-center justify-center border border-border bg-background/90 text-muted-foreground backdrop-blur transition-colors hover:bg-foreground hover:text-background",
            size === "sm" ? "size-7" : "size-6",
            current && cn(current.tone, "border-current hover:text-background"),
          )}
          aria-label={current ? `Flagged ${current.label}` : "Flag for revision"}
          title={current ? current.label : "Flag for revision"}
        >
          <Icon className={cn(size === "sm" ? "size-3.5" : "size-3")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-48 p-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-0.5">
          {OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const active = flag === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setFlag(opt.key)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent",
                  active && "bg-accent",
                )}
              >
                <OptIcon className={cn("size-3.5", opt.tone)} />
                <span>{opt.label}</span>
              </button>
            );
          })}
          {flag && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                onClick={() => setFlag(null)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent"
              >
                <X className="size-3.5" /> Clear flag
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
