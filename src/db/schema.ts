import Dexie, { type Table } from "dexie";
import { dbNameForActiveWorkspace } from "@/services/workspaceService";


export type ResourceType = "video" | "pdf" | "markdown" | "html" | "image" | "other";

export type RevisionFlag = "important" | "revision" | "difficult" | "done";

export type ResourceStatus = "active" | "trashed";

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  mimeType: string;
  driveId: string;
  size: number;
  dayAssignment: number | null;
  orderIndex: number;
  isDownloaded: boolean;
  localPath: string | null;
  thumbnailUrl: string | null;
  addedAt: number;
  lastOpenedAt: number | null;
  durationSeconds: number | null;
  transcriptText?: string | null;
  folderPath?: string;
  parentFolderId?: string;
  revisionFlag?: RevisionFlag | null;
  // v7: file-management fields
  tags?: string[];
  status?: ResourceStatus;
  trashedAt?: number | null;
  originalFolderPath?: string | null;
  copyOf?: string | null;
  difficultyRating?: number | null;
  folderColor?: string | null;
  folderIcon?: string | null;
}


export interface Day {
  number: number;
  title: string;
  createdAt: number;
}

export interface Note {
  id: string;
  resourceId: string | null;
  dayNumber: number | null;
  isGlobal: boolean;
  isSummary?: boolean;
  title: string;
  content: string; // TipTap JSON string
  contentMarkdown: string;
  tags: string[];
  linkedTimestamp: number | null;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
}

export interface Progress {
  resourceId: string;
  dayNumber: number | null;
  status: "not_started" | "in_progress" | "completed";
  completedAt: number | null;
  timeSpentSeconds: number;
  videoProgressSeconds: number;
  quizScore: number | null;
  nextReviewDate?: number | null;
}

export interface StudySession {
  id?: number;
  date: string; // YYYY-MM-DD
  startTime: number;
  endTime: number | null;
  resourcesStudied: string[];
  totalTimeSeconds: number;
}

export interface VideoProgress {
  resourceId: string;
  currentTime: number;
  updatedAt: number;
}

export interface PdfAnnotation {
  id?: number;
  resourceId: string;
  pageNumber: number;
  text: string;
  note: string;
  color: string;
  createdAt: number;
}

export interface Bookmark {
  id?: number;
  resourceId: string;
  timestampSeconds: number;
  label: string;
  createdAt: number;
}

export interface Quiz {
  id?: number;
  resourceId: string;
  questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;
  generatedAt: number;
  source: "ai" | "manual";
}

export interface FlashcardRow {
  id: string;
  resourceId: string | null;
  front: string;
  back: string;
  hint?: string;
  ease: number;
  interval: number;
  repetitions: number;
  dueAt: number;
  lastReviewedAt: number | null;
  createdAt: number;
  source: "ai" | "manual";
}

export interface FolderRow {
  path: string;
  name: string;
  parentPath: string;
  createdAt: number;
  source: "drive" | "user";
  // v7
  color?: string | null;
  icon?: string | null;
}

export interface FileOperationLog {
  id: string;
  type:
    | "move"
    | "rename"
    | "trash"
    | "restore"
    | "purge"
    | "copy"
    | "tag"
    | "reorder"
    | "folder_create"
    | "folder_delete"
    | "folder_rename";
  payload: string;
  timestamp: number;
}

export interface Setting {
  key: string;
  value: unknown;
}


export class StudyVaultDB extends Dexie {
  resources!: Table<Resource, string>;
  days!: Table<Day, number>;
  notes!: Table<Note, string>;
  progress!: Table<Progress, string>;
  study_sessions!: Table<StudySession, number>;
  video_progress!: Table<VideoProgress, string>;
  pdf_annotations!: Table<PdfAnnotation, number>;
  bookmarks!: Table<Bookmark, number>;
  quizzes!: Table<Quiz, number>;
  flashcards!: Table<FlashcardRow, string>;
  folders!: Table<FolderRow, string>;
  file_operations_log!: Table<FileOperationLog, string>;
  settings!: Table<Setting, string>;

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      resources: "id, type, dayAssignment, orderIndex, isDownloaded, lastOpenedAt, name",
      days: "number, title",
      notes: "id, resourceId, dayNumber, isGlobal, updatedAt, *tags",
      progress: "resourceId, dayNumber, status, completedAt",
      study_sessions: "++id, date, startTime",
      video_progress: "resourceId",
      pdf_annotations: "++id, resourceId, pageNumber",
      bookmarks: "++id, resourceId, timestampSeconds",
      quizzes: "++id, resourceId",
      settings: "key",
    });
    this.version(2).stores({
      resources: "id, type, dayAssignment, orderIndex, isDownloaded, lastOpenedAt, name, folderPath, parentFolderId",
    });
    this.version(3).stores({
      notes: "id, resourceId, dayNumber, isGlobal, isSummary, updatedAt, *tags",
    });
    this.version(4).stores({
      flashcards: "id, resourceId, dueAt, createdAt, source",
    });
    this.version(5).stores({
      folders: "path, parentPath, name, createdAt, source",
    });
    this.version(6).stores({
      resources: "id, type, dayAssignment, orderIndex, isDownloaded, lastOpenedAt, name, folderPath, parentFolderId, revisionFlag",
    });
    this.version(7).stores({
      resources:
        "id, type, dayAssignment, orderIndex, isDownloaded, lastOpenedAt, name, folderPath, parentFolderId, revisionFlag, status, trashedAt, *tags",
      folders: "path, parentPath, name, createdAt, source, color",
      file_operations_log: "id, type, timestamp",
    }).upgrade(async (tx) => {
      // Backfill status='active' on existing rows so trash filters work.
      await tx.table("resources").toCollection().modify((r: Resource) => {
        if (!r.status) r.status = "active";
        if (!r.tags) r.tags = [];
      });
    });
  }
}



let _db: StudyVaultDB | null = null;
let _dbName: string | null = null;
export function getDb(): StudyVaultDB {
  if (typeof window === "undefined") {
    throw new Error("Database is browser-only");
  }
  // Lazy require to dodge SSR/circular import paths.
  const name = dbNameForActiveWorkspace();
  if (!_db || _dbName !== name) {
    if (_db) { try { _db.close(); } catch { /* noop */ } }
    _db = new StudyVaultDB(name);
    _dbName = name;
  }
  return _db;
}

export function resetDbCache() {
  if (_db) { try { _db.close(); } catch { /* noop */ } }
  _db = null;
  _dbName = null;
}

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  theme: "dark",
  accentColor: "#6C63FF",
  dailyGoalMinutes: 60,
  autoAdvance: false,
  autoDownloadNext: false,
  offlineFolderGranted: false,
  playbackSpeed: 1,
  resumeVideos: true,
  showTimerInSession: true,
  quizTimerEnabled: false,
  driveId: null,
  driveApiKey: null,
  appInitialized: false,
};
