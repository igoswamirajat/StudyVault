import { nanoid } from "nanoid";
import { getDb, type Note, type Resource } from "@/db/schema";

export async function createNote(partial: Partial<Note>): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    id: nanoid(),
    resourceId: partial.resourceId ?? null,
    dayNumber: partial.dayNumber ?? null,
    isGlobal: partial.isGlobal ?? !partial.resourceId,
    isSummary: partial.isSummary ?? false,
    title: partial.title ?? "Untitled note",
    content: partial.content ?? "",
    contentMarkdown: partial.contentMarkdown ?? "",
    tags: partial.tags ?? [],
    linkedTimestamp: partial.linkedTimestamp ?? null,
    createdAt: now,
    updatedAt: now,
    ownerId: "local",
  };
  await getDb().notes.put(note);
  return note;
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<void> {
  const db = getDb();
  const existing = await db.notes.get(id);
  if (!existing) return;
  await db.notes.put({ ...existing, ...patch, updatedAt: Date.now() });
}

export async function deleteNote(id: string): Promise<void> {
  await getDb().notes.delete(id);
}

export async function listNotesForResource(resourceId: string): Promise<Note[]> {
  return getDb().notes.where("resourceId").equals(resourceId).reverse().sortBy("updatedAt");
}

export async function listNotesForDay(day: number): Promise<Note[]> {
  return getDb().notes.where("dayNumber").equals(day).reverse().sortBy("updatedAt");
}

export async function listAllNotes(): Promise<Note[]> {
  return getDb().notes.orderBy("updatedAt").reverse().toArray();
}

export async function searchNotes(query: string): Promise<Note[]> {
  if (!query.trim()) return listAllNotes();
  const q = query.toLowerCase();
  const all = await getDb().notes.toArray();
  return all
    .filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.contentMarkdown.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Find (or create) the single canonical Summary Note for a resource. */
export async function getOrCreateSummary(resource: Resource): Promise<Note> {
  const db = getDb();
  const existing = await db.notes
    .where("resourceId")
    .equals(resource.id)
    .filter((n) => n.isSummary === true)
    .first();
  if (existing) return existing;

  const headerLine =
    (resource.dayAssignment != null ? `Day ${resource.dayAssignment} · ` : "") +
    `${resource.type}` +
    (resource.durationSeconds ? ` · ${Math.round(resource.durationSeconds / 60)} min` : "");

  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: resource.name }] },
      headerLine
        ? {
            type: "paragraph",
            content: [{ type: "text", marks: [{ type: "italic" }], text: headerLine }],
          }
        : { type: "paragraph" },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Key takeaways" }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph" }] },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes & highlights" }] },
      { type: "paragraph" },
    ],
  };

  return createNote({
    resourceId: resource.id,
    dayNumber: resource.dayAssignment,
    isGlobal: false,
    isSummary: true,
    title: `Summary — ${resource.name}`,
    content: JSON.stringify(doc),
    contentMarkdown: `# ${resource.name}\n\n${headerLine}\n\n## Key takeaways\n\n- \n\n## Notes & highlights\n\n`,
  });
}

/** Append a quoted highlight block to a resource's Summary note. */
export async function appendHighlightToSummary(
  resourceId: string,
  text: string,
  meta?: { page?: number; time?: number | null },
): Promise<void> {
  const db = getDb();
  const summary = await db.notes
    .where("resourceId")
    .equals(resourceId)
    .filter((n) => n.isSummary === true)
    .first();
  if (!summary) return;
  const ref =
    meta?.page != null
      ? ` _(p. ${meta.page})_`
      : meta?.time != null
        ? ` _(${Math.floor(meta.time / 60)}:${String(Math.floor(meta.time % 60)).padStart(2, "0")})_`
        : "";
  const cleaned = text.trim().replace(/\s+/g, " ");
  const newMd = (summary.contentMarkdown ?? "") + `\n\n> ${cleaned}${ref}\n`;

  let doc: { type: string; content: unknown[] };
  try {
    doc = JSON.parse(summary.content);
    if (!Array.isArray(doc.content)) doc.content = [];
  } catch {
    doc = { type: "doc", content: [] };
  }
  doc.content.push({
    type: "blockquote",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: cleaned + ref.replace(/_/g, "") }],
      },
    ],
  });
  await db.notes.put({
    ...summary,
    content: JSON.stringify(doc),
    contentMarkdown: newMd,
    updatedAt: Date.now(),
  });
}

/** Notes (other than the given note) whose body links to `term` via [[term]]. */
export async function findBacklinks(term: string, excludeNoteId?: string): Promise<Note[]> {
  if (!term) return [];
  const needle = `[[${term.toLowerCase()}]]`;
  const all = await getDb().notes.toArray();
  return all
    .filter((n) => n.id !== excludeNoteId && (n.contentMarkdown ?? "").toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
