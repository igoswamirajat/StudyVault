import JSZip from "jszip";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { getDb, type Note, type Resource } from "@/db/schema";

export async function exportNotesZip() {
  const db = getDb();
  const notes = await db.notes.toArray();
  const zip = new JSZip();
  for (const note of notes) {
    const folder = note.dayNumber ? `Day ${note.dayNumber}` : "Global";
    const safeName = note.title.replace(/[\\/:*?"<>|]/g, "_") || note.id;
    zip.folder(folder)?.file(`${safeName}.md`, note.contentMarkdown || note.title);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `studyvault-notes-${format(new Date(), "yyyyMMdd")}.zip`);
}

/** Pack: summaries (only) grouped by day, plus an index. */
export async function exportSummariesMarkdownPack() {
  const db = getDb();
  const [resources, notes] = await Promise.all([db.resources.toArray(), db.notes.toArray()]);
  const summaries = notes.filter((n) => n.isSummary);
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const zip = new JSZip();

  const lines: string[] = [`# StudyVault Summaries`, ``, `_Exported ${format(new Date(), "PPP")}_`, ``];
  const byDay = new Map<string, Note[]>();
  for (const s of summaries) {
    const r = s.resourceId ? resourceById.get(s.resourceId) : undefined;
    const key = r?.dayAssignment ? `Day ${r.dayAssignment}` : "Unassigned";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  for (const [day, list] of byDay) {
    lines.push(`## ${day}`, ``);
    for (const s of list) {
      const safe = s.title.replace(/[\\/:*?"<>|]/g, "_");
      lines.push(`- [${s.title}](./${day}/${safe}.md)`);
      zip.folder(day)?.file(`${safe}.md`, s.contentMarkdown || s.title);
    }
    lines.push("");
  }
  zip.file("INDEX.md", lines.join("\n"));
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `studyvault-summaries-${format(new Date(), "yyyyMMdd")}.zip`);
}

/** PDF export of all summary notes. */
export async function exportSummariesPdf() {
  const db = getDb();
  const [resources, notes] = await Promise.all([db.resources.toArray(), db.notes.toArray()]);
  const summaries = notes.filter((n) => n.isSummary);
  const resourceById = new Map(resources.map((r) => [r.id, r]));

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  function ensure(space: number) {
    if (y + space > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }
  function writeLines(text: string, size: number, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
  }

  writeLines("StudyVault — Summary Pack", 20, true);
  writeLines(`Exported ${format(new Date(), "PPPp")}`, 10);
  y += 8;

  // Group by day
  const byDay = new Map<string, Note[]>();
  for (const s of summaries) {
    const r = s.resourceId ? resourceById.get(s.resourceId) : undefined;
    const key = r?.dayAssignment ? `Day ${r.dayAssignment}` : "Unassigned";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  for (const [day, list] of byDay) {
    ensure(40);
    y += 8;
    writeLines(day, 16, true);
    for (const s of list) {
      ensure(40);
      writeLines(s.title, 13, true);
      const md = (s.contentMarkdown || "").replace(/[#>*_`]/g, "").trim();
      writeLines(md || "(empty)", 10);
      y += 6;
    }
  }
  doc.save(`studyvault-summaries-${format(new Date(), "yyyyMMdd")}.pdf`);
}

/** PDF for a single resource: summary + linked notes. */
export async function exportResourceSummaryPdf(resource: Resource) {
  const db = getDb();
  const notes = await db.notes.where("resourceId").equals(resource.id).toArray();
  const summary = notes.find((n) => n.isSummary);
  const others = notes.filter((n) => !n.isSummary);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;
  const ensure = (s: number) => {
    if (y + s > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const write = (text: string, size: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(text, pageWidth - margin * 2)) {
      ensure(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
  };

  write(resource.name, 18, true);
  write(`${resource.type}${resource.dayAssignment ? ` · Day ${resource.dayAssignment}` : ""}`, 10);
  y += 8;
  if (summary) {
    write("Summary", 14, true);
    write((summary.contentMarkdown || "").replace(/[#>*_`]/g, "").trim() || "(empty)", 10);
  }
  for (const n of others) {
    y += 8;
    ensure(40);
    write(n.title, 13, true);
    write((n.contentMarkdown || "").replace(/[#>*_`]/g, "").trim() || "(empty)", 10);
  }
  const safe = resource.name.replace(/[\\/:*?"<>|]/g, "_");
  doc.save(`${safe}.pdf`);
}



export async function exportProgressCsv() {
  const db = getDb();
  const [resources, progress] = await Promise.all([db.resources.toArray(), db.progress.toArray()]);
  const progressMap = new Map(progress.map((p) => [p.resourceId, p]));
  const header = ["Day", "Resource", "Status", "TimeSpentSec", "CompletedAt", "QuizScore"];
  const rows = resources.map((r) => {
    const p = progressMap.get(r.id);
    return [
      r.dayAssignment ?? "",
      `"${r.name.replace(/"/g, '""')}"`,
      p?.status ?? "not_started",
      p?.timeSpentSeconds ?? 0,
      p?.completedAt ? new Date(p.completedAt).toISOString() : "",
      p?.quizScore ?? "",
    ].join(",");
  });
  const csv = [header.join(","), ...rows].join("\n");
  saveAs(new Blob([csv], { type: "text/csv" }), `studyvault-progress-${format(new Date(), "yyyyMMdd")}.csv`);
}

export async function exportFullBackup() {
  const db = getDb();
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    resources: await db.resources.toArray(),
    days: await db.days.toArray(),
    notes: await db.notes.toArray(),
    progress: await db.progress.toArray(),
    study_sessions: await db.study_sessions.toArray(),
    video_progress: await db.video_progress.toArray(),
    pdf_annotations: await db.pdf_annotations.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    quizzes: await db.quizzes.toArray(),
    settings: await db.settings.toArray(),
  };
  saveAs(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    `studyvault-backup-${format(new Date(), "yyyyMMdd-HHmm")}.json`,
  );
}

export async function importFullBackup(file: File) {
  const text = await file.text();
  const data = JSON.parse(text);
  const db = getDb();
  await db.transaction(
    "rw",
    [db.resources, db.days, db.notes, db.progress, db.study_sessions, db.video_progress, db.pdf_annotations, db.bookmarks, db.quizzes, db.settings],
    async () => {
      await Promise.all([
        db.resources.clear(),
        db.days.clear(),
        db.notes.clear(),
        db.progress.clear(),
        db.study_sessions.clear(),
        db.video_progress.clear(),
        db.pdf_annotations.clear(),
        db.bookmarks.clear(),
        db.quizzes.clear(),
        db.settings.clear(),
      ]);
      if (data.resources) await db.resources.bulkPut(data.resources);
      if (data.days) await db.days.bulkPut(data.days);
      if (data.notes) await db.notes.bulkPut(data.notes);
      if (data.progress) await db.progress.bulkPut(data.progress);
      if (data.study_sessions) await db.study_sessions.bulkPut(data.study_sessions);
      if (data.video_progress) await db.video_progress.bulkPut(data.video_progress);
      if (data.pdf_annotations) await db.pdf_annotations.bulkPut(data.pdf_annotations);
      if (data.bookmarks) await db.bookmarks.bulkPut(data.bookmarks);
      if (data.quizzes) await db.quizzes.bulkPut(data.quizzes);
      if (data.settings) await db.settings.bulkPut(data.settings);
    },
  );
}
