import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, HelpCircle, Send, X, Sparkles, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import type { Resource } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { useDraggable } from "@/hooks/useDraggable";
import { cn } from "@/lib/utils";
import { buildResourceContext, gatherResourceMedia } from "@/services/aiContext";
import {
  aiAnswerDoubt,
  aiStudyAssistant,
  isAiConfigured,
  isMutatingAction,
  type AssistantAction,
  type ChatTurn,
} from "@/services/aiService";

type Tab = "doubt" | "assistant";

/** An action plus its lifecycle in the chat (mutating ones await confirmation). */
interface PendingAction {
  action: AssistantAction;
  status: "pending" | "done" | "cancelled" | "failed";
  note?: string;
}

interface DockMessage extends ChatTurn {
  /** Actions the assistant asked to run, shown as chips under its reply. */
  actions?: PendingAction[];
}

export interface AiDockProps {
  resource: Resource;
  /** Compact snapshot of the current session for the assistant to reason over. */
  buildSessionContext: () => string;
  /** Executes one assistant action; returns a short status line for the chat. */
  runAction: (action: AssistantAction) => Promise<string>;
}

/**
 * Floating, draggable AI dock for the Study Room with two modes:
 *  - Doubt Buster: grounded Q&A about THIS resource (uses sampled video frames).
 *  - Assistant: chat that can also drive the app via typed actions.
 * Both are non-streaming (answers land when complete), matching the app's
 * createServerFn round-trip model.
 */
export function AiDock({ resource, buildSessionContext, runAction }: AiDockProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("doubt");
  const [doubtMsgs, setDoubtMsgs] = useState<DockMessage[]>([]);
  const [asstMsgs, setAsstMsgs] = useState<DockMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const drag = useDraggable({
    storageKey: "studyvault:ai-dock-pos",
    defaultPos: { right: 16, bottom: 92 },
  });

  const messages = tab === "doubt" ? doubtMsgs : asstMsgs;
  const setMessages = tab === "doubt" ? setDoubtMsgs : setAsstMsgs;

  function scrollToEnd() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    if (!(await isAiConfigured())) {
      toast.error("Configure your AI provider in Settings → AI first");
      return;
    }

    const nextHistory: DockMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextHistory);
    setInput("");
    setBusy(true);
    scrollToEnd();

    try {
      if (tab === "doubt") {
        const context = await buildResourceContext(resource);
        const media = await gatherResourceMedia(resource);
        const { answer } = await aiAnswerDoubt(
          resource.name,
          context,
          nextHistory.map(({ role, content }) => ({ role, content })),
          media,
        );
        setMessages([...nextHistory, { role: "assistant", content: answer }]);
      } else {
        const { reply, actions } = await aiStudyAssistant(
          nextHistory.map(({ role, content }) => ({ role, content })),
          buildSessionContext(),
        );
        // Safe actions (navigation/generation) run immediately; mutating ones
        // (create unit, move, mark complete, start studying) wait for a confirm
        // chip so the AI can't silently reorganize the user's library.
        const pending: PendingAction[] = actions.map((action) => ({
          action,
          status: isMutatingAction(action) ? "pending" : "done",
        }));
        for (const p of pending) {
          if (p.status !== "done") continue;
          try {
            p.note = await runAction(p.action);
          } catch (e) {
            p.status = "failed";
            p.note = e instanceof Error ? e.message : "Action failed";
          }
        }
        setMessages([...nextHistory, { role: "assistant", content: reply, actions: pending }]);
      }
    } catch (e) {
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content: `Sorry — that failed. ${e instanceof Error ? e.message : ""}`.trim(),
        },
      ]);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }

  async function resolvePending(msgIdx: number, actIdx: number, confirm: boolean) {
    const list = tab === "doubt" ? doubtMsgs : asstMsgs;
    const target = list[msgIdx]?.actions?.[actIdx];
    if (!target || target.status !== "pending") return;

    let status: PendingAction["status"] = "cancelled";
    let note: string | undefined;
    if (confirm) {
      try {
        note = await runAction(target.action);
        status = "done";
      } catch (e) {
        status = "failed";
        note = e instanceof Error ? e.message : "Action failed";
      }
    }
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIdx && m.actions
          ? {
              ...m,
              actions: m.actions.map((p, j) => (j === actIdx ? { ...p, status, note } : p)),
            }
          : m,
      ),
    );
  }

  if (!open) {
    return (
      <div ref={drag.containerRef} style={drag.style} className="z-30">
        <button
          onPointerDown={drag.handleProps.onPointerDown}
          onClick={(e) => {
            if (!drag.dragging) setOpen(true);
            e.preventDefault();
          }}
          className="flex items-center gap-2 border border-foreground bg-background px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest shadow-[4px_4px_0_var(--foreground)]"
          style={drag.handleProps.style}
          title="Open AI helper (drag to move)"
        >
          <Sparkles className="size-3.5" /> AI
        </button>
      </div>
    );
  }

  return (
    <div
      ref={drag.containerRef}
      style={drag.style}
      className="z-30 flex h-[440px] w-[340px] flex-col border border-foreground bg-background shadow-[6px_6px_0_var(--foreground)]"
    >
      <div
        className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest select-none"
        onPointerDown={drag.handleProps.onPointerDown}
        style={drag.handleProps.style}
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3" /> Study AI
        </span>
        <button
          onClick={() => setOpen(false)}
          title="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex border-b border-border text-xs">
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 font-medium transition-colors",
            tab === "doubt"
              ? "bg-surface-1 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setTab("doubt")}
        >
          <HelpCircle className="size-3.5" /> Doubt Buster
        </button>
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2 font-medium transition-colors",
            tab === "assistant"
              ? "bg-surface-1 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setTab("assistant")}
        >
          <Bot className="size-3.5" /> Assistant
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {tab === "doubt"
              ? `Ask anything about "${resource.name}". I answer from its content and video.`
              : "Ask me to open resources, organize into weeks, generate flashcards, and more."}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-1",
              )}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {m.actions.map((p, j) => (
                    <div key={j} className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          p.status === "done" && "bg-success/15 text-success",
                          p.status === "pending" &&
                            "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                          p.status === "cancelled" &&
                            "bg-background/60 text-muted-foreground line-through",
                          p.status === "failed" && "bg-destructive/15 text-destructive",
                        )}
                      >
                        {p.action.type.replace(/_/g, " ")}
                      </span>
                      {p.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            className="h-5 px-2 text-[10px]"
                            onClick={() => resolvePending(i, j, true)}
                          >
                            <Check className="mr-0.5 size-3" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-2 text-[10px]"
                            onClick={() => resolvePending(i, j, false)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        p.note && (
                          <span className="text-[10px] text-muted-foreground">{p.note}</span>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={tab === "doubt" ? "Ask a doubt…" : "Ask or instruct…"}
          className="max-h-24 flex-1 resize-none rounded-md border border-border bg-surface-1 px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <Button size="sm" onClick={() => void send()} disabled={busy || !input.trim()}>
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
