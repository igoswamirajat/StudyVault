import JSZip from "jszip";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import { getDb, type Note, type Resource } from "@/db/schema";
import type { WeeklyRecap } from "./recapService";

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

  const lines: string[] = [
    `# StudyVault Summaries`,
    ``,
    `_Exported ${format(new Date(), "PPP")}_`,
    ``,
  ];
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
  saveAs(
    new Blob([csv], { type: "text/csv" }),
    `studyvault-progress-${format(new Date(), "yyyyMMdd")}.csv`,
  );
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
    youtube_playlists: await db.youtube_playlists.toArray(),
    notebooks: await db.notebooks.toArray(),
    notebook_cells: await db.notebook_cells.toArray(),
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
    [
      db.resources,
      db.days,
      db.notes,
      db.progress,
      db.study_sessions,
      db.video_progress,
      db.pdf_annotations,
      db.bookmarks,
      db.quizzes,
      db.settings,
      db.youtube_playlists,
      db.notebooks,
      db.notebook_cells,
    ],
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
        db.youtube_playlists.clear(),
        db.notebooks.clear(),
        db.notebook_cells.clear(),
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
      if (data.youtube_playlists) await db.youtube_playlists.bulkPut(data.youtube_playlists);
      if (data.notebooks) await db.notebooks.bulkPut(data.notebooks);
      if (data.notebook_cells) await db.notebook_cells.bulkPut(data.notebook_cells);
    },
  );
}

export function formatRecapHtml(recap: WeeklyRecap): string {
  const fmtDur = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const dailyRows = recap.dailyBreakdown
    .map(
      (d, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500">${dayNames[i]}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${format(new Date(d.date), "MMM d")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums">${d.seconds > 0 ? fmtDur(d.seconds) : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${d.resources.length > 0 ? d.resources.map((r) => r.name).join(", ") : "—"}</td>
      </tr>`,
    )
    .join("");

  const studiedRows = recap.resourcesStudied
    .slice(0, 10)
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${r.name}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#888;text-transform:capitalize">${r.type}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums">${fmtDur(r.seconds)}</td>
      </tr>`,
    )
    .join("");

  const weakRows = recap.weakAreas
    .map(
      (w) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${w.name}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${w.score != null ? `${w.score}%` : "In progress"}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StudyVault Weekly Recap</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#fff">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6C63FF,#4F46E5);padding:32px 24px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">📚 Weekly Study Recap</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px">
        ${format(new Date(recap.weekStart), "MMM d")} – ${format(new Date(recap.weekEnd), "MMM d, yyyy")}
      </p>
    </div>

    <!-- Stats Cards -->
    <div style="display:flex;gap:12px;padding:24px 24px 0">
      <div style="flex:1;background:#f8f7ff;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#6C63FF">${fmtDur(recap.totalSeconds)}</div>
        <div style="font-size:12px;color:#888;margin-top:4px">Study Time</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#16a34a">${recap.daysActive}/7</div>
        <div style="font-size:12px;color:#888;margin-top:4px">Days Active</div>
      </div>
      <div style="flex:1;background:#fef3c7;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#d97706">${recap.streak}🔥</div>
        <div style="font-size:12px;color:#888;margin-top:4px">Day Streak</div>
      </div>
    </div>

    <!-- Summary Stats -->
    <div style="padding:16px 24px;display:flex;gap:24px;font-size:14px;color:#555">
      <span>📖 <strong>${recap.resourcesStudied.length}</strong> resources studied</span>
      <span>✅ <strong>${recap.resourcesCompleted.length}</strong> completed</span>
      <span>🃏 <strong>${recap.dueFlashcards}</strong> flashcards due</span>
    </div>

    <!-- Daily Breakdown -->
    <div style="padding:0 24px 24px">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#333">Daily Breakdown</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#555">Day</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#555">Date</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;color:#555">Time</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#555">Resources</th>
          </tr>
        </thead>
        <tbody>${dailyRows}</tbody>
      </table>
    </div>

    ${
      recap.resourcesStudied.length > 0
        ? `
    <!-- Top Resources -->
    <div style="padding:0 24px 24px">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#333">Top Resources</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:6px 12px;text-align:left;font-weight:600;color:#555">Resource</th>
            <th style="padding:6px 12px;text-align:left;font-weight:600;color:#555">Type</th>
            <th style="padding:6px 12px;text-align:right;font-weight:600;color:#555">Time</th>
          </tr>
        </thead>
        <tbody>${studiedRows}</tbody>
      </table>
    </div>`
        : ""
    }

    ${
      recap.weakAreas.length > 0
        ? `
    <!-- Weak Areas -->
    <div style="padding:0 24px 24px">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#333">Areas to Review</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:6px 12px;text-align:left;font-weight:600;color:#555">Resource</th>
            <th style="padding:6px 12px;text-align:right;font-weight:600;color:#555">Score</th>
          </tr>
        </thead>
        <tbody>${weakRows}</tbody>
      </table>
    </div>`
        : ""
    }

    <!-- Footer -->
    <div style="padding:24px;text-align:center;color:#999;font-size:12px;border-top:1px solid #eee">
      Generated by StudyVault · ${format(new Date(), "PPP")}
    </div>

  </div>
</body>
</html>`;
}

export function exportWeeklyRecapHtml(recap: WeeklyRecap) {
  const html = formatRecapHtml(recap);
  const blob = new Blob([html], { type: "text/html" });
  saveAs(blob, `studyvault-recap-${recap.weekStart}.html`);
}
