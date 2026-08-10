import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NotebookLanguage =
  | "javascript"
  | "python"
  | "html"
  | "c"
  | "cpp"
  | "rust"
  | "go"
  | "sql"
  | "r";

export const LANGUAGE_LABELS: Record<NotebookLanguage, string> = {
  javascript: "JavaScript",
  python: "Python",
  html: "HTML",
  c: "C",
  cpp: "C++",
  rust: "Rust",
  go: "Go",
  sql: "SQL",
  r: "R",
};

export const LANGUAGE_ICONS: Record<NotebookLanguage, string> = {
  javascript: "🟨",
  python: "🐍",
  html: "🌐",
  c: "⚙️",
  cpp: "⚡",
  rust: "🦀",
  go: "🐹",
  sql: "🗄️",
  r: "📊",
};

export const SUPPORTED_LANGUAGES: NotebookLanguage[] = [
  "javascript",
  "python",
  "html",
  "c",
  "cpp",
  "rust",
  "go",
  "sql",
  "r",
];

interface Props {
  value: NotebookLanguage | undefined;
  onChange: (lang: NotebookLanguage) => void;
  /** Compact button trigger (for inline cell headers). */
  compact?: boolean;
}

/** Language grid/table — always-visible. Use inside dialogs/modals. */
export function LanguageSelectorGrid({
  value,
  onChange,
}: {
  value: NotebookLanguage;
  onChange: (lang: NotebookLanguage) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
            value === lang
              ? "border-foreground bg-accent"
              : "border-border hover:bg-accent/60",
          )}
        >
          <span className="text-base leading-none">{LANGUAGE_ICONS[lang]}</span>
          <span className="truncate">{LANGUAGE_LABELS[lang]}</span>
          {value === lang && <Check className="ml-auto size-3.5 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

/** Compact dropdown trigger — for per-cell language switching. */
export function LanguagePicker({ value, onChange, compact: _compact }: Props) {
  const [open, setOpen] = useState(false);
  const current: NotebookLanguage = value ?? "javascript";
  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 text-[11px]"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-sm leading-none">{LANGUAGE_ICONS[current]}</span>
        <span>{LANGUAGE_LABELS[current]}</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  onChange(lang);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors",
                  current === lang
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="text-sm leading-none">{LANGUAGE_ICONS[lang]}</span>
                <span>{LANGUAGE_LABELS[lang]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}