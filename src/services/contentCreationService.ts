import { nanoid } from "nanoid";
import { getDb, type Resource, type ResourceType } from "@/db/schema";
import { createNotebook } from "@/services/notebookService";
import { createNote } from "@/services/notesService";

export type NewContentKind =
  | { kind: "note" }
  | { kind: "markdown"; title?: string; folderPath?: string }
  | { kind: "code"; title?: string; folderPath?: string; language?: string }
  | { kind: "html"; title?: string; folderPath?: string }
  | { kind: "notebook"; title?: string };

export interface CreatedContent {
  id: string;
  resourceId?: string;
  noteId?: string;
  notebookId?: string;
}

export const NEW_CONTENT_LABELS: Record<NewContentKind["kind"], string> = {
  note: "Note",
  markdown: "Markdown file",
  code: "Code file",
  html: "HTML file",
  notebook: "Notebook",
};

async function nextOrderIndex(): Promise<number> {
  const db = getDb();
  const all = await db.resources.toArray();
  return all.reduce((max, r) => Math.max(max, r.orderIndex ?? 0), 0) + 1;
}

export async function createContent(
  type: NewContentKind,
  defaultPath = "",
): Promise<CreatedContent> {
  const now = Date.now();

  if (type.kind === "note") {
    const note = await createNote({
      title: "",
      content: "",
      contentMarkdown: "",
      isGlobal: true,
    });
    return { id: note.id, noteId: note.id };
  }

  if (type.kind === "notebook") {
    const notebook = await createNotebook(type.title ?? "Untitled notebook");
    return { id: notebook.id, notebookId: notebook.id };
  }

  const kind = type.kind; // "markdown" | "code" | "html"
  const spec: Record<
    "markdown" | "code" | "html",
    { type: ResourceType; mime: string; ext: string }
  > = {
    markdown: { type: "markdown", mime: "text/markdown", ext: "md" },
    code: { type: "other", mime: "text/plain", ext: "txt" },
    html: { type: "html", mime: "text/html", ext: "html" },
  };
  const { type: rType, mime, ext } = spec[kind];
  const name = type.title ?? `Untitled ${kind}.${ext}`;
  const folderPath = type.folderPath ?? defaultPath;

  const resource: Resource = {
    id: nanoid(),
    name,
    type: rType,
    mimeType: mime,
    driveId: "",
    size: 0,
    dayAssignment: null,
    orderIndex: await nextOrderIndex(),
    isDownloaded: true,
    localPath: null,
    thumbnailUrl: null,
    addedAt: now,
    lastOpenedAt: null,
    durationSeconds: null,
    folderPath: folderPath || undefined,
    parentFolderId: undefined,
    status: "active",
    trashedAt: null,
    tags: [],
    source: "local",
  };
  await getDb().resources.put(resource);

  await getDb().notes.put({
    id: nanoid(),
    resourceId: resource.id,
    dayNumber: null,
    isGlobal: false,
    isSummary: false,
    title: name,
    content: "",
    contentMarkdown: scaffoldMarkdown(kind, name, type.kind === "code" ? type.language : undefined),
    tags: ["scaffold"],
    linkedTimestamp: null,
    createdAt: now,
    updatedAt: now,
    ownerId: "local",
  });

  return { id: resource.id, resourceId: resource.id };
}

function scaffoldMarkdown(
  kind: "markdown" | "code" | "html",
  name: string,
  language?: string,
): string {
  if (kind === "markdown") return `# ${name.replace(/\.[^.]+$/, "")}\n\nStart writing…`;
  if (kind === "html")
    return '<!doctype html>\n<html>\n  <head><meta charset="utf-8"><title>Page</title></head>\n  <body><h1>Hello</h1></body>\n</html>';
  const lang = language ?? "javascript";
  return `// ${lang} file\nconsole.log("hello");\n`;
}
