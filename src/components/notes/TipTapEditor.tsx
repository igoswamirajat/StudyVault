import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Markdown } from "tiptap-markdown";
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code, Heading1, Heading2, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string; // JSON string
  onChange: (json: string, markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onReady?: (editor: Editor) => void;
  /** Tailwind max-height class for the scrollable editor body. Defaults to max-h-[40vh]. */
  maxHeightClassName?: string;
}

export function TipTapEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  onReady,
  maxHeightClassName = "max-h-[40vh]",
}: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      Typography,
      Placeholder.configure({ placeholder: placeholder ?? "Start typing your note…" }),
      Markdown.configure({ html: false, linkify: true, transformPastedText: true, transformCopiedText: false }),
    ],
    content: value ? (safeParseJson(value) as object) : "",
    autofocus: autoFocus,
    onUpdate({ editor }) {
      const json = JSON.stringify(editor.getJSON());
      // Prefer markdown serialization when available so notes round-trip as MD.
      const storage = (editor.storage as unknown as { markdown?: { getMarkdown: () => string } }).markdown;
      const md = storage?.getMarkdown ? storage.getMarkdown() : editor.getText();
      onChangeRef.current(json, md);
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert prose-sm max-w-none min-h-[140px] focus:outline-none px-3 py-2 break-words",
      },
    },
    immediatelyRender: false,
  });

  // Update content when value changes from outside (note switch)
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    if (current !== value && value) {
      editor.commands.setContent(safeParseJson(value) as object);
    }
  }, [value, editor]);

  // Expose the editor instance once mounted.
  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);


  if (!editor) return <div className="h-32 animate-pulse rounded-md bg-surface-2" />;

  return (
    <div className="flex flex-col rounded-md border border-border bg-surface-1">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} aria-label="Bold">
          <Bold className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} aria-label="Italic">
          <Italic className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} aria-label="Strikethrough">
          <Strikethrough className="size-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} aria-label="Heading 1">
          <Heading1 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} aria-label="Heading 2">
          <Heading2 className="size-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} aria-label="Bullet list">
          <List className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} aria-label="Ordered list">
          <ListOrdered className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} aria-label="Quote">
          <Quote className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} aria-label="Code">
          <Code className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => {
            const url = window.prompt("URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
          aria-label="Link"
        >
          <LinkIcon className="size-3.5" />
        </ToolbarBtn>
      </div>
      <div className={cn("overflow-y-auto overflow-x-hidden", maxHeightClassName)}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarBtn({
  onClick,
  active,
  children,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
