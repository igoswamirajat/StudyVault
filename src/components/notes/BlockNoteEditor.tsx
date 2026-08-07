import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  GripVertical,
  Plus,
  Code,
  List,
  ListOrdered,
  Quote,
  Minus,
  FileText,
  Heading as HeadingIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type BlockNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: BlockNode[];
};

const ICONS: Record<string, { label: string; icon: typeof FileText; cls?: string }> = {
  paragraph: { label: "Text", icon: FileText },
  heading: { label: "Heading", icon: HeadingIcon, cls: "text-lg font-bold" },
  bulletList: { label: "Bullet list", icon: List },
  orderedList: { label: "Numbered list", icon: ListOrdered },
  codeBlock: { label: "Code", icon: Code, cls: "font-mono text-sm" },
  blockquote: { label: "Quote", icon: Quote, cls: "italic border-l-2 pl-2" },
  horizontalRule: { label: "Divider", icon: Minus },
  taskList: { label: "To-do list", icon: List },
  table: { label: "Table", icon: Quote },
};

const TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "codeBlock",
  "blockquote",
  "horizontalRule",
] as const;
type BlockType = (typeof TYPES)[number];

function emptyBlock(type: string): BlockNode {
  if (type === "heading")
    return { type, attrs: { level: 2 }, content: [{ type: "text", text: "" }] };
  if (type === "bulletList" || type === "orderedList")
    return {
      type,
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
        },
      ],
    };
  if (type === "codeBlock")
    return { type, attrs: { language: "plaintext" }, content: [{ type: "text", text: "" }] };
  if (type === "blockquote")
    return { type, content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] };
  if (type === "horizontalRule") return { type };
  return { type, content: [{ type: "text", text: "" }] };
}

function blockText(node: BlockNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return String((node as { text?: string }).text ?? "");
  return (node.content ?? []).map(blockText).join("");
}

function setText(node: BlockNode, text: string): BlockNode {
  const clone = structuredClone(node);
  if (clone.type === "bulletList" || clone.type === "orderedList")
    clone.content = [
      {
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    ];
  else if (clone.type === "blockquote")
    clone.content = [{ type: "paragraph", content: [{ type: "text", text }] }];
  else if (clone.type === "horizontalRule") return clone;
  else clone.content = [{ type: "text", text }];
  return clone;
}

function jsonToBlocks(value: string): BlockNode[] {
  try {
    const doc = JSON.parse(value) as { content?: BlockNode[] } | null;
    const list = doc?.content;
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {
    /* fall through */
  }
  return [emptyBlock("paragraph")];
}

function blocksToJson(blocks: BlockNode[]): string {
  return JSON.stringify({ type: "doc", content: blocks });
}

function blocksToMarkdown(blocks: BlockNode[]): string {
  return blocks
    .map((b) => {
      const t = blockText(b);
      if (b.type === "heading") return `\n## ${t}\n`;
      if (b.type === "bulletList") return `- ${t}`;
      if (b.type === "orderedList") return `1. ${t}`;
      if (b.type === "blockquote") return `> ${t}`;
      if (b.type === "codeBlock") return `\`\`\`\n${t}\n\`\`\``;
      if (b.type === "horizontalRule") return "---";
      if (b.type === "table") return t || "";
      return t;
    })
    .filter(Boolean)
    .join("\n\n");
}

function BlockRow({
  id,
  node,
  onChange,
  onDelete,
  onAddBelow,
  onConvert,
}: {
  id: string;
  node: BlockNode;
  onChange: (n: BlockNode) => void;
  onDelete: () => void;
  onAddBelow: () => void;
  onConvert: (type: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const meta = ICONS[node.type] ?? ICONS.paragraph;
  const text = blockText(node);
  const Info = meta.icon;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group flex w-full items-start gap-1"
    >
      <div className="flex items-center gap-0 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span
          className="cursor-grab touch-none text-muted-foreground/50"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </span>
        <select
          value={node.type}
          onChange={(e) => onConvert(e.target.value)}
          aria-label="Block type"
          className="h-4 w-0 cursor-pointer border-0 bg-transparent opacity-0 focus:w-24 focus:opacity-100"
          title={meta.label}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {ICONS[t].label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Info className="size-3.5 shrink-0 text-muted-foreground" />
          {node.type === "horizontalRule" ? (
            <div className="w-full border-t border-border" />
          ) : (
            <input
              value={text}
              onChange={(e) => onChange(setText(node, e.target.value))}
              placeholder="Type… (use / for slash menu)"
              className={cn(
                "min-w-0 flex-1 bg-transparent text-sm outline-none",
                meta.cls,
                node.type === "blockquote" && "italic border-l-2 border-border pl-2",
              )}
            />
          )}
          <button
            onClick={onDelete}
            aria-label="Delete block"
            className="hidden text-muted-foreground/50 hover:text-destructive group-hover:block"
          >
            <Minus className="size-3.5" />
          </button>
        </div>
        <button
          onClick={onAddBelow}
          aria-label="Add block below"
          className="flex h-0 items-center overflow-hidden text-muted-foreground/0 transition-all hover:text-foreground group-hover:h-4 group-hover:text-muted-foreground"
        >
          <Plus className="size-3" />
          <span className="ml-1 text-[10px]">Add</span>
        </button>
      </div>
    </div>
  );
}

interface Props {
  /** TipTap JSON string. */
  value: string;
  onChange: (json: string, markdown: string) => void;
  preview?: boolean;
  maxHeightClassName?: string;
}

/** Notion-style block note editor. Stores TipTap-compatible JSON so data round-trips. */
export function BlockNoteEditor({ value, onChange, preview, maxHeightClassName }: Props) {
  const blocks = useMemo(() => jsonToBlocks(value), [value]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function emit(next: BlockNode[]) {
    onChange(blocksToJson(next), blocksToMarkdown(next));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((_, i) => String(i) === active.id);
    const to = blocks.findIndex((_, i) => String(i) === over.id);
    if (from < 0 || to < 0) return;
    emit(arrayMove(blocks, from, to));
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between border-b border-border pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Blocks · drag to reorder · hover row for type/add</span>
        <span className="hidden font-normal normal-case sm:inline">
          {blocks.length} block{blocks.length === 1 ? "" : "s"}
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={blocks.map((_, i) => String(i))}
          strategy={verticalListSortingStrategy}
        >
          <div
            className={cn("space-y-0.5 py-2", maxHeightClassName ?? "max-h-[45vh] overflow-y-auto")}
          >
            {blocks.map((node, i) => (
              <BlockRow
                key={String(i)}
                id={String(i)}
                node={node}
                onChange={(n) => emit(blocks.map((b, j) => (j === i ? n : b)))}
                onConvert={(type) => emit(blocks.map((b, j) => (j === i ? emptyBlock(type) : b)))}
                onDelete={() => emit(blocks.filter((_, j) => j !== i))}
                onAddBelow={() => {
                  const next = [...blocks];
                  next.splice(i + 1, 0, emptyBlock("paragraph"));
                  emit(next);
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!preview && (
        <button
          onClick={() => emit([...blocks, emptyBlock("paragraph")])}
          className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" /> Add block
        </button>
      )}
    </div>
  );
}
