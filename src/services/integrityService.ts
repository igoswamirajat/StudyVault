import { getDb } from "@/db/schema";
import { toast } from "sonner";

export interface OrphanCounts {
  notes: number;
  annotations: number;
  bookmarks: number;
  quizzes: number;
  flashcards: number;
  notebooks: number;
  cells: number;
}

/**
 * Scan all relationally-linked tables and delete rows whose foreign key
 * points at a resource that no longer exists. Returns the counts of removed
 * records and shows a toast summarising the result.
 */
export async function repairOrphans(): Promise<OrphanCounts> {
  const db = getDb();
  const resourceIds = new Set(await db.resources.toCollection().primaryKeys());

  const counts: OrphanCounts = {
    notes: 0,
    annotations: 0,
    bookmarks: 0,
    quizzes: 0,
    flashcards: 0,
    notebooks: 0,
    cells: 0,
  };

  await db.transaction(
    "rw",
    [
      db.notes,
      db.pdf_annotations,
      db.bookmarks,
      db.quizzes,
      db.flashcards,
      db.notebooks,
      db.notebook_cells,
    ],
    async () => {
      // Notes
      const orphanNotes = await db.notes
        .filter((n) => n.resourceId != null && !resourceIds.has(n.resourceId))
        .toArray();
      if (orphanNotes.length) {
        await db.notes.bulkDelete(orphanNotes.map((n) => n.id));
        counts.notes = orphanNotes.length;
      }

      // PDF annotations
      const orphanAnn = await db.pdf_annotations
        .filter((a) => !resourceIds.has(a.resourceId))
        .toArray();
      if (orphanAnn.length) {
        const aIds = orphanAnn.map((a) => a.id).filter((id): id is number => id != null);
        await db.pdf_annotations.bulkDelete(aIds);
        counts.annotations = orphanAnn.length;
      }

      // Bookmarks
      const orphanBm = await db.bookmarks.filter((b) => !resourceIds.has(b.resourceId)).toArray();
      if (orphanBm.length) {
        const bIds = orphanBm.map((b) => b.id).filter((id): id is number => id != null);
        await db.bookmarks.bulkDelete(bIds);
        counts.bookmarks = orphanBm.length;
      }

      // Quizzes
      const orphanQ = await db.quizzes.filter((q) => !resourceIds.has(q.resourceId)).toArray();
      if (orphanQ.length) {
        const qIds = orphanQ.map((q) => q.id).filter((id): id is number => id != null);
        await db.quizzes.bulkDelete(qIds);
        counts.quizzes = orphanQ.length;
      }

      // Flashcards (resourceId is nullable — standalone cards are valid)
      const orphanFc = await db.flashcards
        .filter((f) => f.resourceId != null && !resourceIds.has(f.resourceId))
        .toArray();
      if (orphanFc.length) {
        await db.flashcards.bulkDelete(orphanFc.map((f) => f.id));
        counts.flashcards = orphanFc.length;
      }

      // Notebooks + their cells
      const orphanNb = await db.notebooks
        .filter((n) => n.resourceId != null && !resourceIds.has(n.resourceId))
        .toArray();
      if (orphanNb.length) {
        const nbIds = orphanNb.map((n) => n.id);
        await db.notebooks.bulkDelete(nbIds);
        const orphanCells = await db.notebook_cells.where("notebookId").anyOf(nbIds).toArray();
        await db.notebook_cells.bulkDelete(orphanCells.map((c) => c.id));
        counts.notebooks = orphanNb.length;
        counts.cells = orphanCells.length;
      }
    },
  );

  const total =
    counts.notes +
    counts.annotations +
    counts.bookmarks +
    counts.quizzes +
    counts.flashcards +
    counts.notebooks +
    counts.cells;

  if (total > 0) {
    toast.success(`Repaired workspace — removed ${total} orphaned record${total === 1 ? "" : "s"}`);
  } else {
    toast.info("Workspace is clean — no orphans found");
  }

  return counts;
}
