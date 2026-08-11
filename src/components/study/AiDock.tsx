import { useRef, useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  HelpCircle,
  Send,
  X,
  Sparkles,
  Loader2,
  Check,
  Copy,
  CheckCheck,
  Brain,
  Layers,
  StickyNote,
  RefreshCw,
} from "lucide-react";
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
  trimChatHistory,
  aiCanSendMedia,
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

const STORAGE_KEY_PREFIX = "studyvault:ai-chat:";

function loadChatHistory(resourceId: string, tab: Tab): DockMessage[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${resourceId}:${tab}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChatHistory(resourceId: string, tab: Tab, msgs: DockMessage[]) {
  try {
    // Keep last 20 messages to avoid localStorage bloat
    const trimmed = msgs.slice(-20);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${resourceId}:${tab}`, JSON.stringify(trimmed));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

const QUICK_ACTIONS = [
  { label: "Quiz me", icon: Brain, message: "Quiz me on this resource" },
  { label: "Flashcards", icon: Layers, message: "Make flashcards from this" },
  { label: "Summarize", icon: Sparkles, message: "Summarize the key points" },
  { label: "Explain simply", icon: RefreshCw, message: "Explain this simply" },
];

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
  const doubtContextRef = useRef<{ resourceId: string; value: string; at: number } | null>(null);

  const drag = useDraggable({
    storageKey: "studyvault:ai-dock-pos",
    defaultPos: { right: 16, bottom: 92 },
  });

  // Load persisted chat on mount / resource change
  useEffect(() => {
    setDoubtMsgs(loadChatHistory(resource.id, "doubt"));
    setAsstMsgs(loadChatHistory(resource.id, "assistant"));
  }, [resource.id]);

  // Persist on change
  useEffect(() => {
    if (doubtMsgs.length > 0) saveChatHistory(resource.id, "doubt", doubtMsgs);
  }, [doubtMsgs, resource.id]);
  useEffect(() => {
    if (asstMsgs.length > 0) saveChatHistory(resource.id, "assistant", asstMsgs);
  }, [asstMsgs, resource.id]);

  // Quick action chips dispatch this event so they don't need the send ref
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) void sendRef.current(detail.message);
    };
    window.addEventListener("studyvault:ai-dock-send", handler);
    return () => window.removeEventListener("studyvault:ai-dock-send", handler);
  }, []);

  const sendRef = useRef<(msg: string) => Promise<void>>(async () => {});

  const messages = tab === "doubt" ? doubtMsgs : asstMsgs;
  const setMessages = tab === "doubt" ? setDoubtMsgs : setAsstMsgs;

  function scrollToEnd() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  const send = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || busy) return;

      if (!(await isAiConfigured())) {
        toast.error("Configure your AI provider in Settings → AI first");
        return;
      }

      const nextHistory: DockMessage[] = [...messages, { role: "user", content: msg }];
      setMessages(nextHistory);
      if (!text) setInput("");
      setBusy(true);
      scrollToEnd();

      try {
        if (tab === "doubt") {
          let context = doubtContextRef.current?.value;
          const cache = doubtContextRef.current;
          if (
            !context ||
            !cache ||
            cache.resourceId !== resource.id ||
            Date.now() - cache.at > 30_000
          ) {
            context = await buildResourceContext(resource, {
              maxChars: 7000,
              includeSiblings: false,
            });
            doubtContextRef.current = { resourceId: resource.id, value: context, at: Date.now() };
          }
          const media = (await aiCanSendMedia()) ? await gatherResourceMedia(resource) : {};
          const { answer } = await aiAnswerDoubt(
            resource.name,
            context,
            trimChatHistory(nextHistory.map(({ role, content }) => ({ role, content }))),
            media,
          );
          setMessages([...nextHistory, { role: "assistant", content: answer }]);
        } else {
          const { reply, actions } = await aiStudyAssistant(
            trimChatHistory(nextHistory.map(({ role, content }) => ({ role, content }))),
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
    },
    [input, busy, messages, tab, resource, buildSessionContext, runAction, setMessages],
  );
  sendRef.current = send;

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
          <div className="mt-6 space-y-3">
            <p className="text-center text-xs text-muted-foreground">
              {tab === "doubt"
                ? `Ask anything about "${resource.name}". I answer from its content and video.`
                : "Ask me to open resources, organize into weeks, generate flashcards, and more."}
            </p>
            {tab === "doubt" && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => void send(qa.message)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-1 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <qa.icon className="size-3" /> {qa.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} msgIdx={i} onResolve={resolvePending} />
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

function MessageBubble({
  msg,
  msgIdx,
  onResolve,
}: {
  msg: DockMessage;
  msgIdx: number;
  onResolve: (msgIdx: number, actIdx: number, confirm: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [msg.content]);

  return (
    <div className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2",
          msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-1",
        )}
      >
        {msg.role === "assistant" ? (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        ) : (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        )}

        {/* Copy button for assistant messages */}
        {msg.role === "assistant" && (
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
              title="Copy message"
            >
              {copied ? (
                <CheckCheck className="size-3 text-success" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          </div>
        )}

        {/* Action chips */}
        {msg.actions && msg.actions.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {msg.actions.map((p, j) => (
              <div key={j} className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    p.status === "done" && "bg-success/15 text-success",
                    p.status === "pending" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
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
                      onClick={() => onResolve(msgIdx, j, true)}
                    >
                      <Check className="mr-0.5 size-3" /> Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-2 text-[10px]"
                      onClick={() => onResolve(msgIdx, j, false)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  p.note && <span className="text-[10px] text-muted-foreground">{p.note}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Quick action chips after assistant reply */}
        {msg.role === "assistant" && !msg.actions?.length && (
          <QuickActionChips content={msg.content} />
        )}
      </div>
    </div>
  );
}

function QuickActionChips({ content }: { content: string }) {
  const lower = content.toLowerCase();

  // Show contextual chips based on the assistant's reply
  const chips: { label: string; icon: React.ReactNode; message: string }[] = [];

  if (lower.includes("quiz") || lower.includes("test") || lower.includes("question")) {
    chips.push({
      label: "Quiz me",
      icon: <Brain className="size-3" />,
      message: "Quiz me on this resource",
    });
  }
  if (
    lower.includes("flashcard") ||
    lower.includes("card") ||
    lower.includes("remember") ||
    lower.includes("memorize")
  ) {
    chips.push({
      label: "Make flashcards",
      icon: <Layers className="size-3" />,
      message: "Make flashcards from this",
    });
  }
  chips.push({
    label: "Save as note",
    icon: <StickyNote className="size-3" />,
    message: "Save your last reply as a note for me",
  });
  chips.push({
    label: "Explain differently",
    icon: <RefreshCw className="size-3" />,
    message: "Explain this differently",
  });

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <QuickChip key={chip.label} {...chip} />
      ))}
    </div>
  );
}

function QuickChip({
  label,
  icon,
  message,
}: {
  label: string;
  icon: React.ReactNode;
  message: string;
}) {
  // We use a custom event to send from inside the bubble without prop drilling
  return (
    <button
      onClick={() => {
        window.dispatchEvent(new CustomEvent("studyvault:ai-dock-send", { detail: { message } }));
      }}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {icon} {label}
    </button>
  );
}
